// Datos públicos que la página necesita al abrir: nombre de la app y conexión a las cuentas.
// La clave "anon" de Supabase es pública por diseño; la seguridad la dan las reglas de la base de datos.
import { nubeActiva, limiteMensual, clavePublica, urlSupabase } from './_supabase.js';

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const nube = nubeActiva();
  res.status(200).json({
    nombre: process.env.NOMBRE_APP || 'MaestrIA',
    supabaseUrl: nube ? urlSupabase() : null,
    supabaseAnonKey: nube ? clavePublica() : null,
    limiteIA: limiteMensual(),
  });
}
