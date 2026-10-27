# MaestrIA

Aplicación para planear clases en escuelas rurales multigrado: grados, materias, periodos, clases con fecha, calendario, generador de temarios y guías de aprendizaje hechas con IA (se descargan en PDF y Word).

Cada docente entra con su **cuenta de profesor** (correo, usuario y contraseña):

- **Con Supabase configurado:** las cuentas y la planeación quedan en internet y se abren desde cualquier computador o celular.
- **Sin Supabase:** el inicio de sesión funciona igual, pero las cuentas y la planeación quedan guardadas solo en ese equipo.

En el inicio de sesión la app revisa lo que se escribe (comas, espacios, tildes, la @, dominios mal escritos como "gmial.com", mayúsculas activadas), muestra la seguridad de la contraseña (débil, usable o recomendada) y puede recordar las cuentas usadas en el equipo.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | Toda la aplicación |
| `api/config.js` | Le dice a la página el nombre de la app y cómo conectarse a las cuentas |
| `api/guia.js` | Genera las guías con IA y lleva la cuenta de cuántas usa cada docente al mes |
| `api/_supabase.js` | Ayudas internas para hablar con Supabase |
| `supabase.sql` | Crea las tablas de la base de datos (se ejecuta una sola vez) |

## Puesta en marcha (una sola vez)

### 1. Base de datos y cuentas (Supabase, plan gratuito)

1. Entre a [supabase.com](https://supabase.com), cree una cuenta y toque **New project**. Elija un nombre, una contraseña para la base de datos (guárdela) y la región más cercana.
2. Cuando el proyecto esté listo, abra **SQL Editor → New query**, pegue todo el contenido de `supabase.sql` y toque **Run**. Si ya lo había ejecutado antes, ejecútelo otra vez: agrega lo nuevo sin borrar nada.
3. En **Authentication → URL Configuration**, en **Site URL**, escriba la dirección de su página en Vercel (por ejemplo `https://su-app.vercel.app`). Ahí llegan los enlaces de los correos de activación y de cambio de contraseña.
4. En **Settings → API Keys** copie:
   - la **Publishable key** (empieza por `sb_publishable_`),
   - la **Secret key** (empieza por `sb_secret_`). Esta es secreta: no la comparta.
5. Copie también la **Project URL** (está en el botón **Connect** o en **Settings → Data API**). Se ve así: `https://abcdxyz.supabase.co`.

### 2. Variables en Vercel

En su proyecto de Vercel: **Settings → Environment Variables**. Agregue:

| Variable | Valor |
|---|---|
| `SUPABASE_URL` | La Project URL |
| `SUPABASE_PUBLISHABLE_KEY` | La Publishable key |
| `SUPABASE_SECRET_KEY` | La Secret key |
| `GEMINI_API_KEY` | Su clave de IA (o `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`) |
| `NOMBRE_APP` | Otro nombre para mostrar (opcional; por defecto MaestrIA) |
| `IA_LIMITE_MES` | Guías con IA por docente al mes (opcional, 60 por defecto) |

La variable `CODIGO_ACCESO` ya no hace falta: ahora solo los docentes con cuenta pueden generar guías. Puede borrarla.

Después vaya a **Deployments**, toque los tres puntos del último y elija **Redeploy**.

### 3. Probar

Abra su página, toque **Crear una cuenta**, active la cuenta con el correo que llega y entre.

## Antes de vender (recomendado)

- **Correos:** Supabase envía pocos correos por hora con su servicio de prueba. Para muchos clientes, configure un servicio de correo propio en **Authentication → Emails → SMTP Settings**. Ahí mismo puede poner en español los textos de los correos.
- **IA:** el plan gratuito de Gemini tiene un solo cupo diario para toda la aplicación. Con varios clientes, active la facturación en Google AI Studio e incluya ese costo en su precio.
- **Si no configura Supabase**, la aplicación sigue funcionando como antes: sin cuentas y guardando solo en el navegador.
