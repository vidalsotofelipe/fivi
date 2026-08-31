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
