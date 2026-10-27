# SInPLe Guachera (web)

App web instalable (PWA) para el registro de terneros por establecimiento.
Los datos y el ingreso usan Supabase (mismo proyecto que SInPLe Stock, tablas con prefijo `simple_guachera_`).

## Qué incluye hoy

- Ingreso con email y contraseña, alta de cuenta y recuperación de contraseña.
- Establecimientos: crear, renombrar, eliminar. Cada usuario ve solo los suyos.
- Terneros: alta, edición, baja/reactivación, búsqueda por caravana o ubicación,
  categoría automática por edad (Guachera 0–63 días, Acostumbramiento 64–150, Recría 151–300).

## Puesta en marcha (una sola vez)

1. **Base de datos**: en Supabase → SQL Editor, pegar y ejecutar `supabase/migrations/0001_base.sql`.
   Se puede volver a ejecutar sin romper nada.
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
- `src/components/CalvesPanel.tsx`: terneros.
- `src/lib/calves.ts`: edad, categorías y validaciones (con pruebas en `tests/`).
- `supabase/migrations/`: tablas y reglas de seguridad (RLS). Cada cambio de base va en un archivo nuevo numerado.
- `public/`: íconos, `manifest.webmanifest` y `sw.js` (permite instalarla y abrirla sin señal).
