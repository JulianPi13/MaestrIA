// Ayudas del servidor para hablar con Supabase (cuentas y uso de la IA).
// Los archivos que empiezan por "_" no se publican como direcciones en Vercel.

// Acepta las claves nuevas de Supabase (publishable / secret) y las antiguas (anon / service_role)
export const clavePublica = () => process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const servicio = () => process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
export const nubeActiva = () => Boolean(process.env.SUPABASE_URL && clavePublica());
export const limiteMensual = () => Math.max(1, parseInt(process.env.IA_LIMITE_MES || '60', 10) || 60);
const base = () => process.env.SUPABASE_URL.replace(/\/+$/, '');

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
  if (!r.ok) throw new Error('No se pudo leer el uso de la IA: ' + r.status);
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
