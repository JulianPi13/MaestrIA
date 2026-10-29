// Datos del plan del profesor que tiene la sesión iniciada, y renovación con un código.
import { nubeActiva, usuarioDesdeToken, tokenDe, esAdmin, perfilDe, vigente, ponerVence, nuevoVence, normalizarCodigo, reservarCodigo, liberarCodigo, marcarUsado, leerBody, tieneSecreta, ERRORES_CODIGO } from './_supabase.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!nubeActiva()) return res.status(400).json({ code: 'sin_nube' });
  const u = await usuarioDesdeToken(tokenDe(req));
  if (!u) return res.status(401).json({ code: 'sesion' });
  const admin = esAdmin(u.email);
  if (!tieneSecreta()) return res.status(200).json({ vence: null, vigente: true, admin, sinControl: true });
  try {
    let p = await perfilDe(u.id);
    // Un administrador nunca queda bloqueado
    if (admin && !vigente(p)) { const v = nuevoVence(null, 36500); await ponerVence(u.id, v); p = { ...(p || {}), vence: v }; }
    if (req.method === 'GET') return res.status(200).json({ vence: p?.vence || null, vigente: admin || vigente(p), admin });
    if (req.method !== 'POST') return res.status(405).json({ code: 'metodo' });
    const b = await leerBody(req);
    if (b.accion !== 'canjear') return res.status(400).json({ code: 'accion' });
    const codigo = normalizarCodigo(b.codigo);
    if (!codigo) return res.status(400).json({ code: b.codigo ? 'codigo_formato' : 'codigo_vacio' });
    const plan = await reservarCodigo(codigo);
    // Primero se marca el código como usado (de una vez y solo si sigue apartado para esta persona); después se suma el plan
    try { await marcarUsado(codigo, plan.reserva, u.id); } catch (e) { await liberarCodigo(codigo, plan.reserva); throw e; }
    const v = nuevoVence(p?.vence, plan.plan_dias);
    await ponerVence(u.id, v);
    return res.status(200).json({ vence: v, vigente: true, admin, dias: plan.plan_dias });
  } catch (e) {
    const code = ERRORES_CODIGO.has(e.code) || e.code === 'sin_secreta' ? e.code : 'error';
    if (code === 'error') console.error('Error en cuenta', e);
    return res.status(code === 'error' ? 502 : 400).json({ code, ...(e.expiro ? { expiro: e.expiro } : {}), ...(code === 'error' ? { detalle: String(e.message || '').slice(0, 160) } : {}) });
  }
}
