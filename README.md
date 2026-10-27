# MaestrIA

Aplicación para planear clases en escuelas rurales multigrado: grados, materias, periodos, clases con fecha, calendario, generador de temarios y guías de aprendizaje hechas con IA (se descargan en PDF y Word).

Cada docente entra con su **cuenta de profesor** (correo, usuario y contraseña). Para crear la cuenta necesita un **código de activación** que usted le entrega cuando paga su plan:

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
| `api/registro.js` | Crea la cuenta del profesor solo si el código de activación es válido |
| `api/cuenta.js` | Dice hasta cuándo va el plan del profesor y lo renueva con un código |
| `api/admin.js` | Panel de administración: generar y anular códigos, extender o suspender planes |
| `api/estado.js` | Revisión de la configuración: abra `su-pagina.vercel.app/api/estado` para ver si algo está mal y cómo arreglarlo |
| `supabase.sql` | Crea las tablas de la base de datos (se ejecuta una sola vez) |

## Puesta en marcha (una sola vez)

### 1. Base de datos y cuentas (Supabase, plan gratuito)

1. Entre a [supabase.com](https://supabase.com), cree una cuenta y toque **New project**. Elija un nombre, una contraseña para la base de datos (guárdela) y la región más cercana.
2. Cuando el proyecto esté listo, abra **SQL Editor → New query**, pegue todo el contenido de `supabase.sql` y toque **Run**. Si ya lo había ejecutado antes, ejecútelo otra vez: agrega lo nuevo sin borrar nada.
3. En **Authentication → Sign In / Providers**, **apague "Allow new users to sign up"** y guarde. Así nadie puede crear cuentas por fuera de la aplicación; la aplicación sigue creándolas, pero solo con un código válido.
4. En **Authentication → URL Configuration**, en **Site URL**, escriba la dirección de su página en Vercel (por ejemplo `https://su-app.vercel.app`). Ahí llegan los enlaces de los correos de activación y de cambio de contraseña.
5. En **Settings → API Keys** copie:
   - la **Publishable key** (empieza por `sb_publishable_`),
   - la **Secret key** (empieza por `sb_secret_`). Esta es secreta: no la comparta.
6. Copie también la **Project URL** (está en el botón **Connect** o en **Settings → Data API**). Se ve así: `https://abcdxyz.supabase.co`.

### 2. Variables en Vercel

En su proyecto de Vercel: **Settings → Environment Variables**. Agregue:

| Variable | Valor |
|---|---|
| `SUPABASE_URL` | La Project URL |
| `SUPABASE_PUBLISHABLE_KEY` | La Publishable key |
| `SUPABASE_SECRET_KEY` | La Secret key |
| `GEMINI_API_KEY` | Su clave de IA (o `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`) |
| `ADMIN_CORREOS` | **Su correo** (el del administrador). Si son varios, sepárelos con comas |
| `CONTACTO_VENTAS` | Opcional: a dónde escribir para comprar un código, por ejemplo `WhatsApp 300 123 4567`. Se muestra en el registro |
| `NOMBRE_APP` | Otro nombre para mostrar (opcional; por defecto MaestrIA) |
| `IA_LIMITE_MES` | Guías con IA por docente al mes (opcional, 60 por defecto) |

La variable `CODIGO_ACCESO` ya no hace falta: ahora solo los docentes con cuenta pueden generar guías. Puede borrarla.

Después vaya a **Deployments**, toque los tres puntos del último y elija **Redeploy**.

### 3. Probar

Si algo no funciona, abra `su-pagina.vercel.app/api/estado`: muestra cada problema de configuración y cómo arreglarlo.

Abra su página, toque **Crear una cuenta**, **deje vacío el código** y regístrese con el correo que puso en `ADMIN_CORREOS`. Esa es su cuenta de administrador: no vence y le muestra la sección **Administración**.

## Cómo vender

1. Cuando un profesor le pague, entre a **Administración**, elija el plan (1 mes, 3 meses, 6 meses o 1 año), escriba para quién es y toque **Generar**.
2. Toque **Copiar mensaje para WhatsApp** y péguelo en el chat del profesor. El mensaje trae el código y los pasos.
3. El profesor toca **Crear una cuenta**, escribe el código y sus datos, y entra de una vez. Cada código sirve una sola vez.
4. **Renovar:** genere otro código y envíelo. El profesor lo escribe en **Configuración → Mi cuenta → Renovar con código**, o en la pantalla que le sale cuando el plan vence. Los días se suman a los que le queden.
5. Desde **Administración → Profesores** puede dar +1 mes o +1 año sin código, o **suspender** a alguien. Con el plan vencido o suspendido, el profesor puede ver y descargar su planeación, pero no guardar cambios ni generar guías.
6. Si un código no se usó y ya no debe servir, tóquelo en **Anular**.

## Antes de vender (recomendado)

- **Correos:** Supabase envía pocos correos por hora con su servicio de prueba. Para muchos clientes, configure un servicio de correo propio en **Authentication → Emails → SMTP Settings**. Ahí mismo puede poner en español los textos de los correos.
- **IA:** el plan gratuito de Gemini tiene un solo cupo diario para toda la aplicación. Con varios clientes, active la facturación en Google AI Studio e incluya ese costo en su precio.
- **Si no configura Supabase**, la aplicación sigue funcionando como antes: sin cuentas y guardando solo en el navegador.
