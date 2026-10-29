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

// ---------- Planes, códigos y administración ----------
import { randomInt, randomUUID } from 'node:crypto';

// Correos con permiso de administrador (variable ADMIN_CORREOS en Vercel, separados por coma)
export const esAdmin = email => (process.env.ADMIN_CORREOS || '').split(/[,;\s]+/).map(x => x.trim().toLowerCase()).filter(Boolean).includes(String(email || '').trim().toLowerCase());
export const tieneSecreta = () => Boolean(servicio());

// Llamada a Supabase con la clave secreta (solo desde el servidor)
export async function sv(path, { method = 'GET', body, prefer } = {}) {
  if (!servicio()) { const e = new Error('Falta SUPABASE_SECRET_KEY'); e.code = 'sin_secreta'; throw e; }
  const r = await fetch(base() + path, { method, headers: { ...cabServicio(), ...(prefer ? { Prefer: prefer } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let d = null; try { d = t ? JSON.parse(t) : null; } catch {}
  if (!r.ok) { const e = new Error((d && (d.msg || d.message || d.error_description)) || ('HTTP ' + r.status)); e.status = r.status; e.code = d?.error_code || d?.code; throw e; }
  return d;
}
export async function leerBody(req) { let b = req.body; if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } } return b || {}; }
export const tokenDe = req => String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');

// Códigos con la forma MAES-XXXX-XXXX, sin letras que se confunden (O, 0, I, 1, L)
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function generarCodigo() { let s = ''; for (let i = 0; i < 8; i++) s += ALFABETO[randomInt(ALFABETO.length)]; return `MAES-${s.slice(0, 4)}-${s.slice(4)}`; }
export function normalizarCodigo(v) { let t = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (t.startsWith('MAES')) t = t.slice(4); return t.length === 8 ? `MAES-${t.slice(0, 4)}-${t.slice(4)}` : null; }

export async function perfilDe(uid) { const d = await sv(`/rest/v1/perfiles?select=id,usuario,usuario_visible,correo,vence,creado&id=eq.${encodeURIComponent(uid)}`); return d?.[0] || null; }
export const vigente = p => Boolean(p?.vence) && new Date(p.vence) > new Date();
export const nuevoVence = (actual, dias) => { const desde = actual && new Date(actual) > new Date() ? new Date(actual) : new Date(); return new Date(desde.getTime() + dias * 86400000).toISOString(); };

// Uso del código en dos pasos, cada uno es una sola operación en la base de datos (no puede quedar a medias):
// 1) apartarlo con una marca única, solo si está libre, sin anular, sin expirar y nadie más lo tiene apartado;
// 2) marcarlo como usado de inmediato, solo si sigue apartado con esa misma marca.
// Si dos personas escriben el mismo código al mismo tiempo, la base de datos deja pasar solo a una.
export async function reservarCodigo(codigo) {
  const c = encodeURIComponent(codigo), ahora = new Date().toISOString(), hace = new Date(Date.now() - 5 * 60000).toISOString();
  const reserva = randomUUID();
  const cond = encodeURIComponent(`(or(expira.is.null,expira.gt.${ahora}),or(reservado_en.is.null,reservado_en.lt.${hace}))`);
  const d = await sv(`/rest/v1/codigos?codigo=eq.${c}&usado_en=is.null&anulado=eq.false&and=${cond}`, { method: 'PATCH', body: { reservado_en: ahora, reserva }, prefer: 'return=representation' });
  if (d?.length) return { ...d[0], reserva };
  const x = (await sv(`/rest/v1/codigos?select=codigo,usado_en,anulado,expira&codigo=eq.${c}`))?.[0];
  const e = new Error('codigo');
  e.code = !x ? 'codigo_no_existe' : x.anulado ? 'codigo_anulado' : x.usado_en ? 'codigo_usado' : (x.expira && new Date(x.expira) <= new Date()) ? 'codigo_expirado' : 'codigo_en_uso';
  if (x?.expira) e.expiro = x.expira;
  throw e;
}
export async function marcarUsado(codigo, reserva, uid) {
  const d = await sv(`/rest/v1/codigos?codigo=eq.${encodeURIComponent(codigo)}&reserva=eq.${reserva}&usado_en=is.null`, { method: 'PATCH', body: { usado_por: uid, usado_en: new Date().toISOString() }, prefer: 'return=representation' });
  if (!d?.length) { const e = new Error('codigo'); e.code = 'codigo_usado'; throw e; }
  return d[0];
}
export const liberarCodigo = (codigo, reserva) => sv(`/rest/v1/codigos?codigo=eq.${encodeURIComponent(codigo)}&reserva=eq.${reserva}&usado_en=is.null`, { method: 'PATCH', body: { reservado_en: null, reserva: null }, prefer: 'return=minimal' }).catch(() => {});
export const borrarUsuario = uid => sv(`/auth/v1/admin/users/${encodeURIComponent(uid)}`, { method: 'DELETE' }).catch(e => console.error('No se pudo borrar la cuenta a medio crear', e));
export const ponerVence = (uid, vence) => sv(`/rest/v1/perfiles?id=eq.${encodeURIComponent(uid)}`, { method: 'PATCH', body: { vence }, prefer: 'return=minimal' });
export const ERRORES_CODIGO = new Set(['codigo_no_existe', 'codigo_anulado', 'codigo_usado', 'codigo_en_uso', 'codigo_expirado']);
