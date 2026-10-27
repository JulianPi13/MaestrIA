// Servicio que pide las guías a una IA.
// Basta con poner UNA de estas claves en Vercel (Settings → Environment Variables):
//   GEMINI_API_KEY     → Google Gemini (tiene plan gratuito, se saca en aistudio.google.com)
//   OPENAI_API_KEY     → ChatGPT de OpenAI (de pago, se saca en platform.openai.com)
//   ANTHROPIC_API_KEY  → Claude de Anthropic (de pago, se saca en console.anthropic.com)
// Opcionales: IA_PROVEEDOR (gemini|openai|anthropic), IA_MODELO.
// Con cuentas (SUPABASE_URL y SUPABASE_ANON_KEY): solo docentes con sesión iniciada, con un límite de guías al mes (IA_LIMITE_MES, 60 por defecto).
// Sin cuentas: CODIGO_ACCESO (palabra secreta) protege el servicio.
import { nubeActiva, limiteMensual, usuarioDesdeToken, usoDelMes, sumarUso } from './_supabase.js';

const PROVEEDORES = {
  gemini: {
    clave: 'GEMINI_API_KEY',
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    modelos: ['gemini-flash-latest', 'gemini-flash-lite-latest'],
  },
  openai: {
    clave: 'OPENAI_API_KEY',
    url: 'https://api.openai.com/v1/chat/completions',
    modelos: ['gpt-5-mini', 'gpt-4o-mini'],
  },
  anthropic: {
    clave: 'ANTHROPIC_API_KEY',
    modelos: ['claude-sonnet-5-5', 'claude-haiku-5-5'],
  },
};

function elegirProveedor() {
  const pedido = (process.env.IA_PROVEEDOR || '').toLowerCase().trim();
  if (PROVEEDORES[pedido] && process.env[PROVEEDORES[pedido].clave]) return pedido;
  return Object.keys(PROVEEDORES).find(p => process.env[PROVEEDORES[p].clave]) || null;
}

async function pedirOpenAICompatible(cfg, clave, modelo, prompt) {
  const r = await fetch(cfg.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${clave}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: modelo,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    }),
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, ok: r.ok, text: data?.choices?.[0]?.message?.content || '', error: data?.error?.message };
}

async function pedirAnthropic(clave, modelo, prompt) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': clave, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: modelo, max_tokens: 12000, messages: [{ role: 'user', content: prompt }] }),
  });
  const data = await r.json().catch(() => ({}));
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  return { status: r.status, ok: r.ok, text, error: data?.error?.message };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const nube = nubeActiva();
  if (req.method !== 'POST' && !(nube && req.method === 'GET')) return res.status(405).json({ code: 'metodo' });

  // Con cuentas: se identifica al docente y se revisa su cupo del mes
  let uid = null, usadas = 0;
  const limite = limiteMensual();
  if (nube) {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const usuario = await usuarioDesdeToken(token);
    if (!usuario) return res.status(401).json({ code: 'sesion' });
    uid = usuario.id;
    try { usadas = await usoDelMes(uid); } catch (e) { console.error(e); return res.status(502).json({ code: e.status === 401 ? 'clave_secreta' : (e.status === 404 ? 'falta_sql' : 'uso_error') }); }
    if (req.method === 'GET') return res.status(200).json({ usadas, limite });
    if (usadas >= limite) return res.status(429).json({ code: 'limite_mes', limite });
  }

  const proveedor = elegirProveedor();
  if (!proveedor) return res.status(500).json({ code: 'sin_clave' });
  const cfg = PROVEEDORES[proveedor];
  const clave = process.env[cfg.clave];

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const { prompt, codigo } = body || {};

  if (!nube && process.env.CODIGO_ACCESO && codigo !== process.env.CODIGO_ACCESO) return res.status(401).json({ code: 'codigo' });
  if (typeof prompt !== 'string' || !prompt.trim()) return res.status(400).json({ code: 'vacio' });
  if (prompt.length > 60000) return res.status(413).json({ code: 'muy_largo' });

  // Primero el modelo elegido (o el principal); si falla, se intenta con el de respaldo.
  const modelos = process.env.IA_MODELO ? [process.env.IA_MODELO, ...cfg.modelos] : cfg.modelos;
  let ultimo = null;
  for (const modelo of [...new Set(modelos)]) {
    try {
      const r = proveedor === 'anthropic'
        ? await pedirAnthropic(clave, modelo, prompt)
        : await pedirOpenAICompatible(cfg, clave, modelo, prompt);
      if (r.ok && r.text) {
        if (uid) await sumarUso(uid);
        return res.status(200).json({ text: r.text, proveedor, modelo, ...(uid ? { usadas: usadas + 1, limite } : {}) });
      }
      ultimo = r;
      console.error(`Falló ${proveedor}/${modelo}:`, r.status, r.error);
      if (r.status === 401 || r.status === 403 || /api key not valid|invalid api key|incorrect api key/i.test(r.error || '')) break; // clave inválida: no tiene sentido seguir
    } catch (e) {
      console.error(`Error con ${proveedor}/${modelo}:`, e);
    }
  }
  const msg = String(ultimo?.error || '');
  if (ultimo?.status === 401 || ultimo?.status === 403 || /api key|api_key|apikey|permission/i.test(msg)) return res.status(502).json({ code: 'clave_invalida', proveedor });
  if (ultimo?.status === 429 || ultimo?.status === 529 || /quota|rate/i.test(msg)) return res.status(429).json({ code: 'rate_limited', proveedor });
  if (ultimo?.status === 404 || /model/i.test(msg)) return res.status(502).json({ code: 'modelo', proveedor });
  if (ultimo?.status >= 500) return res.status(502).json({ code: 'proveedor_caido', proveedor });
  return res.status(502).json({ code: 'error', proveedor, detalle: msg.slice(0, 160) });
}
