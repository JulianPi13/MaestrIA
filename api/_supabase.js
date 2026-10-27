// Ayudas del servidor para hablar con Supabase (cuentas y uso de la IA).
// Los archivos que empiezan por "_" no se publican como direcciones en Vercel.

// Acepta las claves nuevas de Supabase (publishable / secret) y las antiguas (anon / service_role)
export const clavePublica = () => process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const servicio = () => process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
// Deja solo "https://xxxx.supabase.co" aunque se haya pegado con /rest/v1, con espacios o la dirección del panel de Supabase
export function urlSupabase(raw = process.env.SUPABASE_URL) {
  let t = String(raw || '').trim().replace(/^['"]|['"]$/g, '');
  if (!t) return '';
  const panel = t.match(/supabase\.com\/dashboard\/project\/([a-z0-9]+)/i);
  if (panel) return `https://${panel[1].toLowerCase()}.supabase.co`;
  if (!/^https?:\/\//i.test(t)) t = 'https://' + t;
  try { return new URL(t).origin; } catch { return ''; }
}
export const nubeActiva = () => Boolean(urlSupabase() && clavePublica());
export const limiteMensual = () => Math.max(1, parseInt(process.env.IA_LIMITE_MES || '60', 10) || 60);
const base = () => urlSupabase();

// Mes actual en hora de Colombia, por ejemplo "2026-10"
export const mesActual = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }).slice(0, 7);

// Devuelve el usuario dueño del token de sesión, o null si no es válido
export async function usuarioDesdeToken(token) {
  if (!token) return null;
  try {
    const r = await fetch(`${base()}/auth/v1/user`, {
      headers: { apikey: clavePublica(), Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    const u = await r.json();
    return u?.id ? u : null;
  } catch {
    return null;
  }
}

// La clave secreta nueva va solo en "apikey"; la antigua (un JWT que empieza por "eyJ") también en Authorization
const cabServicio = () => ({ apikey: servicio(), ...(servicio().startsWith('eyJ') ? { Authorization: `Bearer ${servicio()}` } : {}), 'content-type': 'application/json' });

export async function usoDelMes(uid) {
  if (!servicio()) return 0;
  const r = await fetch(`${base()}/rest/v1/uso_ia?select=cantidad&user_id=eq.${encodeURIComponent(uid)}&mes=eq.${mesActual()}`, { headers: cabServicio() });
  if (!r.ok) { const e = new Error('No se pudo leer el uso de la IA: ' + r.status + ' ' + (await r.text()).slice(0, 200)); e.status = r.status; throw e; }
  const filas = await r.json();
  return filas?.[0]?.cantidad || 0;
}

export async function sumarUso(uid) {
  if (!servicio()) return null;
  const r = await fetch(`${base()}/rest/v1/rpc/sumar_uso_ia`, {
    method: 'POST',
    headers: cabServicio(),
    body: JSON.stringify({ p_user: uid, p_mes: mesActual() }),
  });
  if (!r.ok) { console.error('No se pudo sumar el uso de la IA', r.status); return null; }
  return r.json();
}
