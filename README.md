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
| Operario | Una sola pantalla simple: tareas de ahora con botón **HECHO**, **Avisar problema** (ternero → síntomas → foto/audio) y **Anotar tarea** con un toque. |

- **Hoy**: dosis de tratamientos y aplicaciones del plan sanitario del día, con color según gravedad
  (rojo grave, naranja moderado, verde leve, celeste plan sanitario). Se marcan aplicadas o no aplicadas (con motivo).
- **Pantalla del operario** (`OperatorHome`): pensada para gente con poca práctica con el celular. Tarjetas grandes por
  tarea con la caravana enorme, color por gravedad, instrucción en lenguaje simple ("Inyección en el músculo" en vez de "IM"),
  botón 🔊 que lee la tarea en voz alta, **HECHO** / **No pude** (motivos para tocar), avance del día y respuestas del veterinario.
- **Avisar** (operario): fotos (comprimidas antes de subir), audio grabado en el celular, texto, ternero y marca de urgente.
  **Avisos** (productor / veterinario): bandeja para ver, escuchar, diagnosticar e indicar el tratamiento; el operario ve
  el diagnóstico. Archivos privados en Supabase Storage (bucket `simple-guachera-avisos`).
- **Registro diario**: alimentación, iniciador, agua, limpieza de cama, calostrado, observaciones; por ternero o general.
- **Protocolos**: de tratamiento (grupo de enfermedad, producto, dosis, vía, frecuencia, duración, retiro) y de
  **plan sanitario por edad** (se aplica una vez a cada ternero dentro de un rango de días de vida; aparece solo en Hoy).
- **Tratamientos**: protocolo + gravedad a uno o varios terneros; se generan las dosis. Se cierran con resultado.
- **Configuración por establecimiento** (al crearlo y desde Más → Configuración): categorías propias con su rango de días,
  tipos de tareas del registro diario y días que el plan sanitario sigue mostrándose como atrasado.
- **Categorías**: automática según la edad o asignada a mano (uno o varios terneros a la vez, con fecha e historial).
  Avisa cuando un ternero superó la edad de la categoría asignada.
- **Terneros**: ficha con datos, calostrado e inmunidad pasiva, pesadas con ganancia diaria, historial sanitario,
  destete y baja (motivo y causa).
- **Indicadores**: mortalidad 1–60 días, morbilidad por diarrea y respiratoria, retratamientos, recuperados, dosis aplicadas,
  inmunidad pasiva, calostrado, ganancia diaria y destete, con semáforo según metas de referencia
  (DCHA Gold Standards, Lombard et al. 2020, INIA). Período elegible.
- **Carga masiva** (pegar desde Excel o subir CSV, con plantilla y vista previa de errores): terneros, pesadas,
  tratamientos, cambios de categoría, calostrado/sangre, destete y bajas.
- **Equipo**: sumar personas por email con su rol. Si todavía no tienen cuenta, quedan invitadas y entran solas al registrarse.

Lo que puede ver y hacer cada rol se controla en la base de datos (RLS y funciones en `supabase/migrations/`),
no solo en la pantalla.

## Puesta en marcha (una sola vez)

1. **Base de datos**: en Supabase → SQL Editor, pegar y ejecutar en orden cada archivo de `supabase/migrations/`
   (`0001_base.sql`, `0002_roles_tratamientos.sql`, `0003_pesadas_indicadores.sql`, `0004_categorias.sql`, `0005_avisos.sql`, …). Se pueden volver a ejecutar sin romper nada.
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
- `src/components/OperatorHome.tsx`: pantalla del operario. `src/hooks/useDayTasks.ts`: tareas del día (compartido).
- `src/components/TodayPanel.tsx`: tareas del día para productor / veterinario.
- `src/lib/plain.ts`: textos en lenguaje simple, turno, síntomas y lectura en voz alta.
- `src/components/LogPanel.tsx`: registro de tareas diarias.
- `src/components/CalvesPanel.tsx` y `BulkCalvesModal.tsx`: terneros y carga masiva.
- `src/components/ProtocolsPanel.tsx`, `TreatmentsPanel.tsx`: protocolos y tratamientos.
- `src/components/TeamPanel.tsx`: equipo, roles e invitaciones.
- `src/components/CalfDetail.tsx`: ficha del ternero. `IndicatorsPanel.tsx`: indicadores. `BulkImport.tsx`: carga masiva.
- `src/lib/roles.ts`, `treatments.ts`, `bulk.ts`, `indicators.ts`: reglas de roles, dosis, carga masiva e indicadores (con pruebas).
- `src/lib/calves.ts`: edad, categorías y validaciones (con pruebas en `tests/`).
- `supabase/migrations/`: tablas y reglas de seguridad (RLS). Cada cambio de base va en un archivo nuevo numerado.
- `public/`: íconos, `manifest.webmanifest` y `sw.js` (permite instalarla y abrirla sin señal).
