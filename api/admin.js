// Panel de administración: generar y anular códigos, ver profesores y extender o suspender planes.
// Solo responde a cuentas cuyo correo está en la variable ADMIN_CORREOS.
import { nubeActiva, usuarioDesdeToken, tokenDe, esAdmin, sv, generarCodigo, normalizarCodigo, nuevoVence, ponerVence, perfilDe, leerBody } from './_supabase.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!nubeActiva()) return res.status(400).json({ code: 'sin_nube' });
  const u = await usuarioDesdeToken(tokenDe(req));
  if (!u) return res.status(401).json({ code: 'sesion' });
  if (!esAdmin(u.email)) return res.status(403).json({ code: 'no_admin' });
  try {
    if (req.method === 'GET') {
      const [codigos, profesores] = await Promise.all([
        sv('/rest/v1/codigos?select=codigo,plan_dias,nota,creado,usado_por,usado_en,anulado&order=creado.desc&limit=300'),
        sv('/rest/v1/perfiles?select=id,usuario,usuario_visible,correo,vence,creado&order=creado.desc&limit=500'),
      ]);
      return res.status(200).json({ codigos, profesores });
    }
    if (req.method !== 'POST') return res.status(405).json({ code: 'metodo' });
    const b = await leerBody(req);
    if (b.accion === 'crear') {
      const dias = Math.min(3650, Math.max(1, parseInt(b.dias, 10) || 0));
      const cantidad = Math.min(50, Math.max(1, parseInt(b.cantidad, 10) || 1));
      if (!dias) return res.status(400).json({ code: 'dias' });
      const nota = String(b.nota || '').trim().slice(0, 120) || null;
      const filas = Array.from({ length: cantidad }, () => ({ codigo: generarCodigo(), plan_dias: dias, nota }));
      const creados = await sv('/rest/v1/codigos', { method: 'POST', body: filas, prefer: 'return=representation' });
      return res.status(200).json({ codigos: creados });
    }
    if (b.accion === 'anular') {
      const c = normalizarCodigo(b.codigo); if (!c) return res.status(400).json({ code: 'codigo_formato' });
      await sv(`/rest/v1/codigos?codigo=eq.${encodeURIComponent(c)}&usado_en=is.null`, { method: 'PATCH', body: { anulado: true }, prefer: 'return=minimal' });
      return res.status(200).json({ ok: true });
    }
    if (b.accion === 'extender' || b.accion === 'suspender') {
      const p = await perfilDe(String(b.id || '')); if (!p) return res.status(404).json({ code: 'no_existe' });
      const vence = b.accion === 'suspender' ? new Date().toISOString() : nuevoVence(p.vence, Math.min(3650, Math.max(1, parseInt(b.dias, 10) || 30)));
      await ponerVence(p.id, vence);
      return res.status(200).json({ ok: true, vence });
    }
    return res.status(400).json({ code: 'accion' });
  } catch (e) {
    console.error('Error en administración', e);
    return res.status(e.code === 'sin_secreta' ? 400 : 502).json({ code: e.code === 'sin_secreta' ? 'sin_secreta' : 'error', detalle: String(e.message || '').slice(0, 160) });
  }
}
