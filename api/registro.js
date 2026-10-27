// Crear cuenta de profesor: solo con un código de activación válido (o si el correo es de un administrador).
// La cuenta queda activa de una vez, sin correo de confirmación, porque el código ya prueba el pago.
import { nubeActiva, esAdmin, sv, normalizarCodigo, reservarCodigo, liberarCodigo, marcarUsado, ponerVence, nuevoVence, leerBody, ERRORES_CODIGO } from './_supabase.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ code: 'metodo' });
  if (!nubeActiva()) return res.status(400).json({ code: 'sin_nube' });
  const b = await leerBody(req);
  const correo = String(b.correo || '').trim().toLowerCase();
  const usuario = String(b.usuario || '').trim().replace(/\s+/g, ' ');
  const llave = String(b.llave || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const clave = String(b.clave || '');
  if (!/^[^@\s,;]+@[^@\s,;]+\.[a-z]{2,}$/i.test(correo)) return res.status(400).json({ code: 'email_address_invalid' });
  if (usuario.length < 3 || usuario.length > 30 || !llave) return res.status(400).json({ code: 'usuario_invalido' });
  if (clave.length < 8) return res.status(400).json({ code: 'weak_password' });

  const admin = esAdmin(correo);
  let codigo = null, reservado = false;
  try {
    let dias = 36500; // administradores: sin vencimiento práctico
    if (!admin) {
      codigo = normalizarCodigo(b.codigo);
      if (!codigo) return res.status(400).json({ code: b.codigo ? 'codigo_formato' : 'codigo_vacio' });
      const plan = await reservarCodigo(codigo); reservado = true; dias = plan.plan_dias;
    }
    const libre = await sv('/rest/v1/rpc/usuario_disponible', { method: 'POST', body: { p_usuario: llave } });
    if (libre === false) { const e = new Error('usuario'); e.code = 'usuario_existe'; throw e; }
    let u;
    try {
      u = await sv('/auth/v1/admin/users', { method: 'POST', body: { email: correo, password: clave, email_confirm: true, user_metadata: { usuario, usuario_clave: llave, rol: 'profesor' } } });
    } catch (e) {
      if (e.status === 422 || /already|exists|registered/i.test(e.message)) e.code = 'user_already_exists';
      else if (/password/i.test(e.message)) e.code = 'weak_password';
      throw e;
    }
    const uid = u?.id || u?.user?.id;
    const vence = nuevoVence(null, dias);
    await ponerVence(uid, vence);
    if (codigo) await marcarUsado(codigo, uid);
    return res.status(200).json({ ok: true, vence, dias });
  } catch (e) {
    if (reservado) await liberarCodigo(codigo);
    const code = e.code && (ERRORES_CODIGO.has(e.code) || ['usuario_existe', 'user_already_exists', 'weak_password', 'sin_secreta'].includes(e.code)) ? e.code : 'error';
    if (code === 'error') console.error('Error en registro', e);
    return res.status(code === 'error' ? 502 : 400).json({ code, ...(code === 'error' ? { detalle: String(e.message || '').slice(0, 160) } : {}) });
  }
}
