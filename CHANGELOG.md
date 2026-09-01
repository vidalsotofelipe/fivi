# Changelog

Todas las novedades relevantes de FIVI. El formato sigue
[Keep a Changelog](https://keepachangelog.com/es/1.1.0/) y el proyecto usa
[Semantic Versioning](https://semver.org/lang/es/) en `0.x` (previo a la primera
versión estable: los cambios incompatibles suben MINOR, no MAJOR).

La versión de la app es la de `package.json`. Ver
[`docs/RELEASES.md`](docs/RELEASES.md) para el procedimiento de release y
rollback.

## [Unreleased]

_(sin cambios pendientes de release)_

## [0.14.1] - 2026-09-01

### Added

- **Acceso provisorio al panel con llave compartida.** Si existe la variable
  server-only `ADMIN_ACCESS_KEY`, un bearer token igual a esa llave habilita
  `/api/admin/*` sin necesidad de crear usuarios. Se entra una vez por
  `/admin/login?k=<LLAVE>` (se guarda en el navegador y se limpia la URL) o
  pegándola en el campo "Llave de acceso". Es un **secreto compartido, no una
  identidad**: en auditoría queda `admin_user_id = null` y
  `metadata.auth = "access-key"`, y el topbar muestra el distintivo "llave".
  El camino de Supabase Auth (`app_admins`) queda intacto para la etapa 2:
  se vuelve a él quitando la variable.

### Changed

- **Alta de gasto**: los atajos de "Gastos frecuentes" pasan **debajo** del
  campo Descripción — funcionan como sugerencias para completarlo, no como un
  paso previo.

### Fixed

- **Campo de fecha desbordando el layout en iOS Safari.** `input[type="date"]`
  trae ancho intrínseco propio y centra el valor, así que se salía del
  contenedor y descolocaba la pantalla. Ahora se normaliza (`appearance: none`,
  `max-width: 100%`, valor alineado a la izquierda vía
  `::-webkit-date-and-time-value`): mismo ancho que el resto de los campos. El
  selector nativo sigue funcionando igual.

## [0.14.0] - 2026-09-01

Panel de administración `/admin`. **Requiere aplicar las migraciones
`0010_admin.sql` + `0011_admin_functions.sql`** (aditivas, ya aplicadas en el
proyecto de producción) y la variable server-only **`SUPABASE_SERVICE_ROLE_KEY`**
(sin ella `/api/admin/*` responde 503 y el panel muestra "no disponible"; la app
principal no se ve afectada). Ver `docs/ADMIN.md`.

### Added

- **`/admin`**: sección privada con login propio por email + contraseña (cliente
  Supabase con `storageKey` separado; la app principal sigue 100% anónima).
  Dashboard con datos reales (KPIs + comparativo + gráfico), Usuarios (tabla
  paginada, detalle, activar/desactivar, conceder/quitar rol admin con
  protección del último), Grupos, Movimientos (gastos + pagos, export CSV),
  Auditoría de acciones administrativas, Estado (versión/entorno/pings, sin
  secretos) y Configuración (moneda por defecto, feature flags).
- **Autorización real por endpoint**: cada Route Handler de `src/app/api/admin/*`
  verifica el Bearer token contra Supabase Auth y la pertenencia a `app_admins`
  antes de responder; usa un cliente **service-role** server-only. Ocultar
  links/componentes no alcanza — la seguridad está en el backend.
- **Migración `0010_admin.sql`**: tablas `app_admins` (con trigger que impide
  quedarse sin ningún administrador), `admin_audit_log`, `admin_settings`
  (defaults seguros), + índices por `created_at`. RLS activada **sin policies**
  (sólo `service_role` accede).
- **Migración `0011_admin_functions.sql`**: funciones SQL que hacen toda la
  agregación del panel (el backend no baja filas), sólo ejecutables por
  `service_role`.

### Notas

- `SyncProvider` no arranca el motor local-first ni la sesión anónima en rutas
  `/admin`.
- Limitaciones del modelo actual (documentadas): `expenses`/`payments` no tienen
  `created_by` → no hay métricas de movimientos por usuario; no hay categorías;
  no hay log de errores de negocio.

## [0.13.0] - 2026-09-01

Foco en saldar deudas de un toque, moneda por ubicación e idioma consistente.
Sin cambios de esquema. Sin migraciones.

### Added

- **Saldar una deuda en un toque.** En "Quién le debe a quién" cada deuda se
  muestra como "Felipe le debe $12.500 a Cami" con un botón **Saldar** que abre
  el pago con pagador, receptor, monto y fecha precargados. Se puede elegir
  **deuda completa** o **pago parcial** (valida > 0 y ≤ deuda pendiente). Al
  confirmar: balances al instante, pago en la actividad, toast con **Deshacer**
  (10 s) y **✕**. Funciona offline; el id de cliente + upsert evitan duplicados
  en reintentos de sync. El "Registrar pago" manual sigue disponible.
- **Detección de país → moneda** al crear un grupo: país por IP (header de
  Vercel, sin guardar la IP) → región del navegador (`Intl.Locale`) → última
  moneda elegida → USD. Mensaje discreto bajo el selector ("Seleccionamos ARS
  según tu ubicación. Podés cambiarlo."), es/en. Nunca bloquea la creación.
  Mapa país→moneda centralizado y ampliable (`src/domain/countryCurrency.ts`).
- **Quetzal guatemalteco (GTQ)** en el catálogo de monedas (2 decimales,
  `es-GT`). Guatemala → GTQ en la detección.
- **Tarjetas de grupo orientadas al usuario**: con "yo" elegido muestran
  "Debés / Te deben / Estás al día", última actividad y aviso de cambios sin
  sincronizar; sin elegir, un CTA "Indicá quién sos en este grupo".
- `docs/ACCOUNT_RECOVERY.md`: diseño (por etapas) de "Guardar / recuperar mi
  FIVI" con Supabase Auth. Aún no implementado.

### Changed

- **Selector de moneda cerrado por defecto**: pasa a un `<select>` nativo — se
  abre al tocarlo, se cierra al elegir o tocar afuera, navegable con teclado y
  accesible; no empuja el contenido.
- **Auto-archivado más estricto**: un grupo sólo se archiva solo si además de no
  tener actividad reciente, **todos los balances están en cero** y **no hay
  cambios sin sincronizar**. Un grupo viejo con deuda pendiente ya no se archiva.
- Mensajes de validación propios y traducidos (formularios con `noValidate`); se
  reemplaza el "Please fill out this field" del navegador.

### Fixed

- **Idioma inconsistente** (la app podía verse en inglés con "Español"
  seleccionado). i18next arranca en el idioma efectivo (preferencia > navegador
  > es) y un script en `<head>` fija `<html lang>` antes del primer paint: el
  selector, el atributo y el texto coinciden.

## [0.12.1] - 2026-09-01

### Fixed

- **Abrir un enlace de invitación directamente** (`/join/<token>`, como cuando
  un amigo lo recibe compartido) fallaba con "Las invitaciones requieren
  Supabase configurado". `SyncProvider` sembraba su estado con `remote_ready:
  true`, así que la página de canje actuaba contra el remoto stub antes de que
  Supabase cargara. Ahora se siembra con el estado real del motor (en modo
  cloud, `remote_ready` es `false` hasta que el remoto real está listo). Entrar
  a la invitación desde dentro de la app ya funcionaba. Sin cambios de esquema.

## [0.12.0] - 2026-09-01

Mejoras de UX en la carga de gastos y corrección de un problema de escala en
móvil. Sin cambios de esquema ni de API. Sin migraciones.

### Added

- **Atajos de "Gastos frecuentes"** en el alta de gasto: chips con emoji +
  concepto arriba del campo de descripción. Al elegir uno se precarga el
  concepto y el foco pasa al importe; la carga manual sigue igual. La lista
  prioriza los conceptos más usados del grupo (descripciones que se repiten
  ≥ 2 veces, normalizadas sin acentos/caso) y se completa con una lista por
  defecto (Supermercado, Nafta, Comida, Café, Bebida, Transporte) hasta 6.
  El modelo no tiene categorías: sólo se sugiere el texto del concepto.
- **Botón de cierre (✕) en las notificaciones** (toast), además del
  auto-cierre existente.

### Changed

- El toast ya no se superpone al menú de navegación inferior: se posiciona por
  encima (el menú publica su alto real) y sólo la tarjeta captura toques.

### Fixed

- **Zoom / salto de escala en móvil tras crear un grupo.** Los controles de
  formulario pasan a 16px (`text-base`): por debajo de 16px iOS Safari hace
  zoom automático al enfocar y no lo revierte al navegar. Además se quitó el
  `autoFocus` que abría el teclado al cargar (`/nuevo` y el wizard de gasto) y
  el alto del layout pasa a ser estable (`100svh`) para que el teclado no
  provoque reflow. No se bloquea el zoom manual.

## [0.11.0] - 2026-09-01

Mejora de la pantalla de inicio y una vía para unirse a un grupo desde ahí. Sin
cambios de lógica de negocio, modelo de datos ni de API. Sin migraciones.

### Added

- **Unirse a un grupo desde el inicio.** Nuevo desplegable "¿Tenés una
  invitación?" en `/` (y en la lista "Mis grupos") con un campo para pegar el
  enlace de invitación o escribir el código a mano. Acepta el link completo
  (`.../join/<token>`) o el código suelto; en modo local también reconoce
  `.../g/<id>`. Reusa la pantalla `/join/<token>` existente para el canje —
  conocer el ID del grupo por sí solo sigue sin dar acceso (RLS).

### Changed

- **Nueva pantalla de inicio** (estado sin grupos): titular grande, subtítulo y
  la lista de pasos numerada (01/02/03, acento naranja) con divisores en lugar
  de viñetas. El mismo encabezado se aplica a la vista "Mis grupos".

### i18n

- Claves nuevas bajo `onboarding` (es/en): `subtitle`, `haveInvite`,
  `inviteLabel`, `invitePlaceholder`, `inviteHint`, `inviteSubmit`,
  `inviteRequired`.

## [0.10.1] - 2026-09-01

### Changed

- **Saldo a favor en verde** (`#147A5A` claro / `#3FBF93` oscuro), no en azul.
  Deuda sigue en naranja; el signo +/− lo indica igual. Contraste AA en ambos
  temas.

### Verificado

- Auditoría de sincronización en producción: sesión anónima válida; push
  (grupo + participantes + gasto + reparto + pago) llega a Supabase sin rechazo
  de RLS y la cola se vacía; pull completo e incremental 200 con avance de
  cursor; 12/12 requests REST OK; WebSocket de Realtime conecta y la suscripción
  `postgres_changes` responde `status: ok`; UI en "Sincronizado", cola sin
  items agotados. **Sin errores; sin cambios necesarios.**

Rediseño visual "flat / editorial" según el artefacto de estilo + modo oscuro
con selector. Sin cambios de lógica de negocio, modelo de datos ni de API. Sin
migraciones.

### Added

- **Modo oscuro con selector de 3 opciones** (`Más → Configuración →
  Apariencia`): Sistema / Claro / Oscuro. Preferencia en `localStorage`
  (`fivi:theme`), se aplica al instante sin recarga, sin flash (script en
  `<body>` antes del paint), y actualiza `<meta name="theme-color">` y
  `<html data-theme>`. "Sistema" sigue `prefers-color-scheme` en vivo.
  Paleta oscura derivada del mismo lenguaje visual, con contraste AA.
- `ThemeProvider` + `useTheme()`.

### Changed

- **Nuevo sistema de tokens y estilo flat**: paleta azul (`#1F5FD6`/`#1648A6`) +
  naranja (`#E2662F`/`#B94718`) sobre neutros cálidos; esquinas rectas (sin
  `border-radius`), bordes de 2 px (`border-strong` `#17161A` / `border` sutil),
  micro-labels en mayúsculas (`.label-caps`). Tipografías **Archivo** (UI) y
  **Space Grotesk** (números / display), self-host offline (`public/fonts/`).
- Saldos: positivo (a favor) en **azul**, negativo (debés) en **naranja** — el
  signo +/− lo sigue indicando además del color.
- Todos los componentes base y las 19 pantallas migrados a los tokens nuevos.
  Service worker `v8` (fuentes + CSS cambiaron).
- `Money` usa `Space Grotesk` tabular.

### Removed

- Componentes muertos de antes del rediseño (`BalanceList`, `CurrencySelect`,
  `ExpenseForm`, `MoneyInput`, `MoneyText`, `TransferList`). `parseAmount` se
  movió a `src/lib/amount.ts`.

### Tests

- `idioma.spec.ts`: pasada nueva para el tema (Sistema/Claro/Oscuro cambia
  `data-theme` y `<meta theme-color>` al instante y persiste tras recargar).

## [0.9.1] - 2026-08-31

Auditoría responsive mobile + fix de fecha relativa. Sin cambios de lógica de
negocio, modelo de datos ni de API. Sin migraciones.

### Fixed

- **Fecha relativa "hace 23 horas" en un evento recién creado**: el resumen del
  grupo formateaba el pago reciente con `formatRelative(payment_date)`, pero
  `payment_date` es una **fecha sola** (`YYYY-MM-DD`) y `new Date("2026-08-31")`
  es medianoche **UTC** → en husos negativos (UTC-3) el diff daba ~-23 h. Ahora
  esa fila usa la fecha del pago (`formatDate`, medianoche local), igual que las
  filas de gasto. Además `format.ts` interpreta cualquier fecha sola como
  medianoche local (`toLocalDate`) y `formatRelative` de un evento con menos de
  1 minuto devuelve "ahora" / "now" (antes "este minuto" / "this minute").
- **Overflow horizontal en `Actividad` y `Gastos` a 320 px**: la fila de chips
  de filtro tenía `overflow-x-auto` y el último chip se salía del viewport.
  Ahora la fila usa `flex-wrap` (todos los filtros visibles, sin scroll).

### Changed

- **Service worker `v7`** + auto-recarga al actualizar: si una versión nueva
  toma el control (`skipWaiting` + `clients.claim`), la página se recarga una
  vez para tomar los assets nuevos. Evita que un caché viejo siga mostrando una
  UI previa (causa probable de reportes de "responsive roto" sobre builds
  anteriores al rediseño).

### Tests

- `responsive.spec.ts` reescrito: además de "sin scroll horizontal a nivel
  documento", verifica que **ningún elemento** desborde el viewport
  (el `body { overflow-x: hidden }` puede enmascararlo) y que el contenido no
  **colapse a una columna angosta** (`<main>` y su primer bloque ~= ancho
  disponible). Anchos 320/360/375/390/430; pasada extra en inglés.
- `format.test.ts`: evento recién creado → "ahora"/"now"; fecha sola tratada
  como local; `formatRelative` con timestamp completo inmune al huso.

Grupos archivables (para que no se acumulen grupos eternos en la lista) +
archivado automático por inactividad + snapshot de respaldo.

### Added

- **Archivar / restaurar grupo** (`Más → Configuración`). Archivar saca el grupo
  de la lista principal sin borrarlo; se restaura con un toque desde la sección
  "Archivados" del inicio o desde el propio grupo. Es un flag `archived_at` que
  se sincroniza como cualquier campo del grupo (archivar en un dispositivo
  archiva en todos).
- **Archivado automático**: al abrir la app se archivan los grupos sin gastos ni
  pagos nuevos (ni cambios en sus datos) en los últimos **30 días**
  (`ARCHIVE_AFTER_DAYS`). Aviso por toast; siempre restaurable.
- **Snapshot de respaldo** (`group_archives`, migración `0009`): al archivarse un
  grupo, un trigger de Postgres guarda un JSON completo (grupo + participantes +
  gastos + reparto + pagos) para export/backup a futuro. Sólo lo ve un miembro
  del grupo (RLS).
- Sección "Archivados" colapsable en el inicio; aviso "Grupo archivado" con
  acción de restaurar al abrir un grupo archivado.

### Migración Supabase

- **`0009_group_archive.sql`** — **backward-compatible** (aditiva pura). Agrega
  `groups.archived_at`, la tabla `group_archives` + su policy de select, y el
  trigger `snapshot_group_on_archive`. Aplicar junto con `0.9.0`. Un frontend
  anterior la ignora.

## [0.8.2] - 2026-08-31

Corrige una condición de carrera al arrancar en modo cloud que podía dejar un
grupo (y sus movimientos) sólo en el dispositivo, sin llegar nunca al servidor.
Síntoma: al querer compartir ese grupo, el servidor rechazaba crear la
invitación ("new row violates row-level security policy" — el grupo no tenía
membresía de dueño en Postgres). Sin cambios de esquema ni de API.

### Fixed

- **`SyncEngine` no hace push mientras el remoto real (Supabase) todavía no
  reemplazó al stub inicial.** Antes, cualquier operación encolada en esa
  ventana (~1-3 s tras cargar la página) se enviaba al stub, que la "aceptaba",
  y se marcaba como sincronizada sin haber llegado al servidor. `setRemote()` →
  `markRemoteReady()` ya forzaba un `syncNow()` al conectar; ahora ése es el
  primero que realmente envía la cola.
- **Recuperación de datos huérfanos**: tras el primer pull completo con el
  remoto real, `SyncEngine` re-encola el alta de los grupos locales vivos (y sus
  participantes/gastos/pagos) que el servidor no devolvió y que no tienen ya una
  op en la cola. Un grupo que quedó sólo en local por la carrera se sube solo en
  la próxima carga; al insertarse en Postgres, el trigger `groups_add_owner` le
  asigna la membresía de dueño y compartir vuelve a funcionar.

Identidad de marca. Sin cambios de lógica de negocio, datos ni backend.

### Changed

- **Nueva identidad de marca**: app icon, favicons e íconos PWA reemplazados por
  el logotipo definitivo (cuadrado redondeado + círculo naranja). `favicon.ico`
  nuevo (16 + 32). `scripts/gen-icons.mjs` reescrito para dibujar la marca nueva
  con antialiasing (sigue sin dependencias). Set completo de logotipos en
  `brand/`. Service worker `v6` (invalida el caché de íconos anterior).
- Onboarding: se muestra el app icon sobre el título.
- `manifest.webmanifest`: `background_color` `#17161a` (fondo de la marca),
  `theme_color` `#0e1111`.

## [0.8.0] - 2026-08-31

Rediseño mobile-first + internacionalización ES/EN. **No cambia** reglas de
negocio, `domain/`, repos `data/`, motor `sync/` ni backend/auth: sólo la capa
de presentación. Sin migraciones de Supabase. Detalle y desviaciones respecto
del handoff en [`docs/REDISENIO.md`](docs/REDISENIO.md).

### Added

- **i18n ES/EN** (`react-i18next` + `i18next`): español por defecto y fallback,
  cambio en caliente sin recarga desde `Más → Configuración → Idioma`,
  preferencia en `localStorage` (`fivi:lang`), sugerencia por
  `navigator.language` en la primera visita. Todos los textos en
  `src/i18n/locales/{es,en}.json` (12 namespaces) con interpolación y
  pluralización. Formato de fechas / números / moneda con `Intl` y el locale de
  la UI; la moneda del grupo no cambia con el idioma.
- **Tokens de diseño** (`globals.css` + `tailwind.config.ts`): custom properties
  RGB con paleta clara y oscura (`prefers-color-scheme`), foco visible WCAG 2.2,
  `prefers-reduced-motion`.
- **Navegación inferior** de 4 destinos (Resumen / Gastos / Personas / Más) y
  layout mobile-first (`AppShell` ancho fluido, tope 480 px, sin scroll
  horizontal a nivel documento).
- Rutas nuevas: `/g/[groupId]/nuevo/personas`, `/g/[groupId]/listo`,
  `/g/[groupId]/personas`, `/g/[groupId]/personas/[participantId]`,
  `/g/[groupId]/actividad`, `/g/[groupId]/mas`.
- **Actividad del grupo** (`queries.getGroupActivity`): línea de tiempo derivada
  de timestamps y tombstones existentes, sin schema nuevo. Filtro por tipo y
  persona.
- Selector opcional por dispositivo "¿Quién sos en este grupo?" (`data/settings`,
  no se sincroniza) para "Tu balance" y el filtro "Míos".
- `SyncBanner`: avisos sobre el contenido para sin conexión / error del servidor
  (con "Reintentar") / sin acceso al grupo.
- E2E `responsive.spec.ts` (sin scroll horizontal en 320/360/390/430 px) e
  `idioma.spec.ts` (cambio y persistencia de idioma); test unitario de paridad
  de claves i18n (`tests/i18n/parity.test.ts`) y de `getGroupActivity`.

### Changed

- Flujos de alta de grupo y de gasto reescritos como asistentes de 3 pasos con
  `StepIndicator`.
- `flow.spec.ts` reescrito para la UI nueva; `playwright.config.ts` fija
  `locale: es-AR` (la app toma el idioma del navegador si no hay preferencia).
- Componentes existentes migrados a los tokens y a i18n (`Button`, `fields`,
  `EmptyState`, `CurrencyPicker`, `ExpenseWizard`, `InvitesSection`,
  `ShareButton`, `AddToPastExpenses`, …).

## [0.7.2] - 2026-08-31

### Fixed

- **Sync cloud rota**: `supabaseRemote.pull` arrancaba la paginación keyset de
  los ids de `expenses` con un cursor vacío (`.gt("id", "")`), y PostgREST
  respondía `400 invalid input syntax for type uuid: ""`. Cada corrida de sync
  fallaba y quedaba en "Reintentando…"; la app funcionaba local-first pero nada
  se sincronizaba al servidor. Introducido en 0.7.0 (paginación keyset). El
  cursor ahora arranca en el UUID nil. Sin cambios de esquema.

## [0.7.1] - 2026-08-31

### Fixed

- `INSERT ... RETURNING` sobre `groups` fallaba con RLS: la re-lectura de la fila
  recién creada corría la policy de SELECT antes de que el trigger AFTER creara
  la membresía de owner. El push de fivi (`upsert` sin `.select()`,
  `return=minimal`) no se veía afectado, pero el modelo no debería depender de
  ese detalle. Migración `0008_groups_select_creator.sql`: `groups_select` ahora
  también permite `created_by = auth.uid()` (el creador siempre ve su grupo; no
  debilita el acceso: `created_by` lo fija y congela un trigger).

### Migración Supabase

- **`0008_groups_select_creator.sql`** — **backward-compatible**. Reemplaza
  `groups_select` (de `0007`) por una versión con un `OR created_by = auth.uid()`.
  Un frontend `0.7.0` sigue funcionando contra este esquema. Aplicar con
  `0.7.1`.

## [0.7.0] - 2026-08-31

Seguridad de acceso a los grupos: autenticación anónima de Supabase + RLS por
membresía. **Cambio incompatible para despliegues que ya tenían RLS permisiva**
(ver `docs/RELEASES.md` § Rollback y Supabase).

### Added

- Supabase Anonymous Sign-In: sesión anónima persistida, sin email ni contraseña
  (`src/lib/supabase.ts`).
- Tabla `group_members` (roles `owner` / `member`) y `groups.created_by`
  (migración `0005_membership.sql`). El creador de un grupo queda `owner`.
- Invitaciones con token: enlace `/join/<token>` con token aleatorio de 256 bits;
  el servidor guarda sólo el hash SHA-256 (`group_invites`, migración
  `0006_invites.sql`). RPC `redeem_group_invite` valida vigencia y revocación en
  el servidor.
- Ruta `/join/[token]` y sección "Invitaciones" en la configuración del grupo
  (`InvitesSection`, sólo en modo cloud).
- Identificación de versión en la app: pie "FIVI vX.Y.Z · <commit>" en el inicio
  (`AppVersion`, `src/lib/appInfo.ts`), inyectada en build (`next.config.mjs`).
- Tests de RLS reales en proceso con `@electric-sql/pglite`
  (`tests/security/rls.test.ts`).
- `CHANGELOG.md`, `docs/RELEASES.md`, `.nvmrc`, workflow `release.yml`
  (validación de tags `v*`).

### Changed

- RLS: se reemplazan las policies `to anon using (true)` de `0002` por policies
  `to authenticated` basadas en `auth.uid()` + `group_members` (migración
  `0007_rls_auth.sql`). Conocer el UUID de un grupo ya no da acceso.
- `RemotePort` gana métodos opcionales de invitación; `SyncEngine` orquesta el
  canje (`redeemInvite` → `trackGroup`).
- El Service Worker pasa a `v5` y normaliza `/join/<token>` → `/join/_`.

### Security

- `anon` deja de tener acceso a los datos privados. Sólo un miembro lee/edita un
  grupo y sus movimientos; sólo el `owner` administra la membresía.
- Un rechazo del servidor por falta de acceso (RLS) ya no se descarta en
  silencio: el dato local se conserva y la UI muestra "Sin acceso al grupo".

## [0.6.0] - 2026-08-30

Hardening técnico de la sincronización (sin cambios de UI).

### Added

- Cursor de sincronización server-owned: columna `sync_revision` asignada por
  Postgres (secuencia + trigger), usada como cursor incremental en lugar de
  `updated_at` (migración `0003_sync_revision.sql`). Elimina la dependencia del
  reloj del dispositivo.
- Paginación del pull (500 filas por página) para las cinco tablas.
- Integridad referencial en el servidor: FKs compuestas por `group_id` + trigger
  de validación cross-group (migración `0004_referential_integrity.sql`).
- CI en GitHub Actions (`.github/workflows/ci.yml`): `npm ci` + lint + typecheck
  + test + build + E2E, sin credenciales de Supabase.
- Tests E2E con Playwright (flujo completo + escritura offline).

### Changed

- Reintentos de la cola con exponential backoff + jitter, tope de intentos (5) y
  distinción entre errores "reintentables" y "agotados"
  (`sync_queue.next_attempt_at`, Dexie v2). Un item fallido no bloquea a los
  demás; backoff también a nivel corrida.
- Dependencias al día dentro de sus ramas (Next 15.5.x, Vitest 4).

### Fixed

- Un lote de push rechazado por transporte (red caída) ya no "gasta" intentos:
  los items vuelven a `pending`.

---

Las versiones **0.1.0 – 0.5.0** corresponden a las etapas de construcción 1 a 5
(dominio + datos locales, pantallas, backend Supabase, formas de dividir un
gasto, verificación cloud + offline). No se publicaron como releases ni se
etiquetaron; el detalle está en el historial de git (`git log`, commits
"Etapa N").
