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
