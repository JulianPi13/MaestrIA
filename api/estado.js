// Revisión de la configuración: dice qué está mal y cómo arreglarlo, antes de que el docente intente entrar.
// No muestra ninguna clave; solo si están bien o mal puestas.
import { clavePublica, urlSupabase } from './_supabase.js';

const problema = (nivel, que, como) => ({ nivel, que, como });

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const p = [];
  const raw = String(process.env.SUPABASE_URL || '').trim();
  const url = urlSupabase();
  const pub = clavePublica();
  const sec = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const ia = ['GEMINI_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY'].some(k => process.env[k]);

  if (!raw && !pub) {
    p.push(problema('aviso', 'Las cuentas se están guardando solo en cada equipo.', 'Para guardarlas en internet, agregue en Vercel las variables SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY y SUPABASE_SECRET_KEY, y haga Redeploy.'));
  } else {
    if (!url) p.push(problema('error', 'La variable SUPABASE_URL no es una dirección válida.', 'En Vercel cámbiela por la Project URL de Supabase, que se ve así: https://abcdxyz.supabase.co. Luego haga Redeploy.'));
    else if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/i.test(url)) p.push(problema('aviso', `La dirección de Supabase (${url}) no tiene la forma habitual.`, 'Revise que SUPABASE_URL sea la Project URL: https://abcdxyz.supabase.co'));
    if (url && raw.replace(/\/+$/, '') !== url) p.push(problema('aviso', 'SUPABASE_URL tenía algo de más (por ejemplo /rest/v1); la aplicación lo corrigió sola.', `Para dejarlo limpio, en Vercel ponga solo: ${url}`));
    if (!pub) p.push(problema('error', 'Falta la variable SUPABASE_PUBLISHABLE_KEY.', 'En Supabase → Project Settings → API Keys copie la Publishable key (empieza por sb_publishable_) y agréguela en Vercel. Luego haga Redeploy.'));
    else if (pub.startsWith('sb_secret_')) p.push(problema('error', 'En SUPABASE_PUBLISHABLE_KEY puso la clave secreta.', 'Cámbiela por la Publishable key (empieza por sb_publishable_). La Secret key va en SUPABASE_SECRET_KEY.'));
    if (!sec) p.push(problema('error', 'Falta la variable SUPABASE_SECRET_KEY: sin ella no se pueden crear cuentas con código ni controlar los planes.', 'En Supabase → Project Settings → API Keys copie la Secret key (empieza por sb_secret_) y agréguela en Vercel.'));
    else if (sec.startsWith('sb_publishable_')) p.push(problema('error', 'En SUPABASE_SECRET_KEY puso la clave pública.', 'Cámbiela por la Secret key (empieza por sb_secret_).'));

    if (url && pub && !pub.startsWith('sb_secret_')) {
      try {
        const r = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: pub } });
        if (r.status === 401 || r.status === 403) p.push(problema('error', 'Supabase rechazó la Publishable key.', 'Cópiela de nuevo desde Supabase → Project Settings → API Keys, sin espacios, en SUPABASE_PUBLISHABLE_KEY. Revise que sea del mismo proyecto que SUPABASE_URL.'));
        else if (r.status >= 500 || r.status === 404) p.push(problema('error', `Supabase no respondió bien (código ${r.status}).`, 'Entre a supabase.com: si el proyecto dice "Paused", tóquelo para reactivarlo (los proyectos gratis se pausan tras días sin uso). Si no, revise que SUPABASE_URL sea la de su proyecto.'));
        else if (r.ok) {
          const s = await r.json();
          if (!s.disable_signup) p.push(problema('error', 'En Supabase está permitido crear cuentas sin código de activación (por fuera de la aplicación).', 'Apague "Allow new users to sign up" en Supabase → Authentication → Sign In / Providers. La aplicación seguirá creando cuentas, pero solo con un código válido.'));
          const f = await fetch(`${url}/rest/v1/rpc/usuario_disponible`, { method: 'POST', headers: { apikey: pub, 'content-type': 'application/json' }, body: JSON.stringify({ p_usuario: 'prueba-de-configuracion' }) });
          if (f.status === 404) p.push(problema('error', 'Faltan las tablas de la aplicación en Supabase.', 'En Supabase → SQL Editor → New query, pegue todo el archivo supabase.sql y toque Run.'));
        }
      } catch (e) {
        p.push(problema('error', 'No se pudo conectar con Supabase.', `Revise que SUPABASE_URL sea correcta (${url}) y que el proyecto no esté en pausa en supabase.com.`));
      }
      if (sec && !sec.startsWith('sb_publishable_')) {
        try {
          const h = { apikey: sec, ...(sec.startsWith('eyJ') ? { Authorization: `Bearer ${sec}` } : {}) };
          const r = await fetch(`${url}/rest/v1/uso_ia?select=mes&limit=1`, { headers: h });
          if (r.status === 401 || r.status === 403) p.push(problema('error', 'Supabase rechazó la Secret key.', 'Cópiela de nuevo desde Supabase → Project Settings → API Keys (Secret key, empieza por sb_secret_) en SUPABASE_SECRET_KEY.'));
          else if (r.status === 404) p.push(problema('error', 'Falta la tabla de uso de la IA en Supabase.', 'Ejecute de nuevo todo el archivo supabase.sql en Supabase → SQL Editor.'));
          const c = await fetch(`${url}/rest/v1/codigos?select=codigo&limit=1`, { headers: h });
          if (c.status === 404) p.push(problema('error', 'Falta la tabla de códigos de activación en Supabase.', 'Ejecute de nuevo todo el archivo supabase.sql en Supabase → SQL Editor.'));
        } catch {}
      }
    }
  }
  if ((raw || pub) && !String(process.env.ADMIN_CORREOS || '').trim()) p.push(problema('error', 'No hay ningún administrador: nadie puede generar códigos de activación.', 'Agregue en Vercel la variable ADMIN_CORREOS con su correo (si son varios, sepárelos con comas) y haga Redeploy.'));
  if (!ia) p.push(problema('aviso', 'No hay clave de IA: no se podrán generar guías.', 'Agregue en Vercel GEMINI_API_KEY (gratis en aistudio.google.com) y haga Redeploy.'));
  res.status(200).json({ ok: !p.some(x => x.nivel === 'error'), problemas: p });
}
