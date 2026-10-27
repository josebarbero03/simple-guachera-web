# SInPLe Guachera (web)

App web instalable (PWA) para el registro de terneros por establecimiento.
Los datos y el ingreso usan Supabase (mismo proyecto que SInPLe Stock, tablas con prefijo `simple_guachera_`).

## Qué incluye hoy

- Ingreso con email y contraseña, alta de cuenta y recuperación de contraseña.
- Establecimientos con equipo propio. Cada persona tiene un rol por establecimiento:

| Rol | Puede |
| --- | --- |
| Productor (dueño) | Todo, incluido eliminar el establecimiento. Es quien lo creó. |
| Productor / Veterinario | Todo lo de gestión: terneros (alta y carga masiva), protocolos, tratamientos, equipo. |
| Operario | **Hoy** (dosis del día: aplicada / no aplicada) y **Registro** (tareas diarias). Nada más. |

- **Hoy**: dosis pendientes y atrasadas; se marcan como aplicadas o no aplicadas (con motivo), con quién y a qué hora.
- **Registro diario**: alimentación, iniciador, agua, limpieza de cama, calostrado, observaciones; por ternero o general.
- **Protocolos**: producto, dosis, vía, cada cuántas horas, cuántos días y retiro.
- **Tratamientos**: se indica un protocolo a uno o varios terneros a la vez y se generan solas todas las dosis.
  Se cierran con resultado (Recuperado, Sin respuesta, Muerte, Otro) y las dosis pendientes se cancelan.
- **Terneros**: alta, edición, baja, búsqueda, categoría por edad y **carga masiva** pegando desde Excel o subiendo un CSV.
- **Equipo**: sumar personas por email con su rol. Si todavía no tienen cuenta, quedan invitadas y entran solas al registrarse.

Lo que puede ver y hacer cada rol se controla en la base de datos (RLS y funciones en `supabase/migrations/`),
no solo en la pantalla.

## Puesta en marcha (una sola vez)

1. **Base de datos**: en Supabase → SQL Editor, pegar y ejecutar en orden cada archivo de `supabase/migrations/`
   (`0001_base.sql`, `0002_roles_tratamientos.sql`, …). Se pueden volver a ejecutar sin romper nada.
2. **URL de la app en Supabase**: Authentication → URL Configuration → agregar la dirección donde se publique
   la app (por ejemplo `https://josebarbero03.github.io/simple-guachera-web/`) en *Redirect URLs*,
   para que funcionen los enlaces de confirmación y de recuperación de contraseña.
3. **Publicación**: con el repo en GitHub, Settings → Pages → Source: *GitHub Actions*.
   Cada cambio en `main` se publica solo (`.github/workflows/deploy.yml`).

## Desarrollo

```sh
npm install
npm run dev     # http://localhost:5173
npm test        # pruebas de la lógica de terneros
npm run build   # genera dist/
```

Otro proyecto de Supabase: copiar `.env.example` a `.env.local` y cambiar los valores.

## Estructura

- `src/App.tsx`: sesión, encabezado, selector de establecimiento y pestañas.
- `src/components/AuthScreen.tsx`: ingreso, alta de cuenta y recuperación.
- `src/components/FarmsPanel.tsx`: establecimientos.
- `src/components/TodayPanel.tsx`: dosis del día (operario y gestión).
- `src/components/LogPanel.tsx`: registro de tareas diarias.
- `src/components/CalvesPanel.tsx` y `BulkCalvesModal.tsx`: terneros y carga masiva.
- `src/components/ProtocolsPanel.tsx`, `TreatmentsPanel.tsx`: protocolos y tratamientos.
- `src/components/TeamPanel.tsx`: equipo, roles e invitaciones.
- `src/lib/roles.ts`, `treatments.ts`, `bulk.ts`: reglas de roles, dosis y carga masiva.
- `src/lib/calves.ts`: edad, categorías y validaciones (con pruebas en `tests/`).
- `supabase/migrations/`: tablas y reglas de seguridad (RLS). Cada cambio de base va en un archivo nuevo numerado.
- `public/`: íconos, `manifest.webmanifest` y `sw.js` (permite instalarla y abrirla sin señal).
