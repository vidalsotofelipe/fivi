# fivi

PWA para dividir gastos entre un grupo de personas. Offline-first, mobile-first,
un grupo = una moneda. Inspirada en Splitwise, enfocada en simplicidad y
velocidad.

## Estado

Etapa 1 — **base técnica** ✅

- Dominio puro y testeado: dinero / unidades mínimas, división equitativa con
  redondeo determinístico, motor de balances, simplificación de deudas.
- Capa de datos local: IndexedDB (Dexie), repositorios, UUID locales, cola de
  sincronización (`sync_queue`) con soft delete / tombstones.
- Motor de sincronización desacoplado detrás de `RemotePort` + stub sin red.
- Scaffold Next.js + Tailwind + PWA (manifest + service worker a mano).

Etapa 2 — **pantallas del producto** ✅

- Inicio (grupos recientes), crear grupo con selector de moneda buscable.
- Grupo: resumen (total, balances, "cómo saldar las cuentas", historial).
- Gastos: agregar / editar / eliminar, historial, detalle con reparto.
- Balance por persona (pagó / le correspondía / saldo).
- Registrar pago (precargado desde una transferencia sugerida).
- Configuración: datos del grupo, moneda (bloqueada con movimientos),
  participantes, eliminar grupo.
- UI reactiva con `useLiveQuery` (Optimistic UI) + indicador de estado de sync.

Etapa 4 — **formas de dividir un gasto** ✅

- `equal` (partes iguales), `amount` (monto fijo por persona), `percent`
  (porcentajes), `shares` (partes / proporciones). Todas suman exacto el total.
- `distributeByWeights` (método del resto mayor) para % y partes.
- `ExpenseForm` con selector de 4 modos, inputs por participante, validación y
  preview en vivo; el detalle del gasto muestra la estrategia usada.

Etapa 3 — **backend Supabase** ✅

- `supabaseRemote`: `push` (upsert por tabla, en orden de dependencia),
  `pull` incremental por **cursor server-owned** (`sync_revision`), paginado,
  `subscribe` (Realtime por grupo).
- `applyRemoteChanges`: merge de cambios remotos en IndexedDB con
  last-write-wins por `updated_at` + tombstones, sin re-encolar.
- `SyncEngine` aplica el pull, recupera ops interrumpidas y maneja la
  suscripción Realtime con reconciliación por pull.
- Selección automática cloud / local por variables de entorno; Supabase se
  carga de forma diferida (no infla el bundle si no hay credenciales).
- Migraciones `0002` (Realtime + RLS), `0003` (`sync_revision`),
  `0004` (integridad referencial). Iconos PNG.

Etapa 5 — **verificación cloud + offline** ✅

- Camino Supabase probado end to end contra un proyecto real: push, pull en
  dispositivo nuevo abriendo el enlace `/g/<id>`, Realtime (cambio externo →
  UI en vivo) y edición cliente → servidor.
- `SyncEngine.trackGroup` + `requestGroup`: abrir un grupo por enlace en un
  dispositivo sin datos lo trae del servidor.
- Service worker verificado en Chrome real; caché de rutas de grupo
  normalizada (`/g/_/…`) para que funcionen sin conexión sin haberlas visitado.

Etapa 6 — **hardening técnico** ✅

- **Backoff real de sync**: `sync_queue.next_attempt_at`, reintentos con
  exponential backoff + jitter, tope de intentos (5), distinción entre errores
  "reintentables" y "agotados". Un item fallido no bloquea a los demás.
  Backoff también a nivel corrida para no machacar durante una caída de red.
- **Cursor de sincronización server-owned**: columna `sync_revision` asignada
  por Postgres (secuencia + trigger), usada como cursor incremental en vez de
  `updated_at`. Elimina la dependencia del reloj del dispositivo (cambios
  perdidos por clock skew). La resolución de conflictos (LWW por `updated_at`)
  **no cambia**.
- **Paginación** del pull (500 filas/página) para las 5 tablas.
- **Integridad referencial en el servidor** (migración `0004`): FKs compuestas
  (`paid_by` / `from`/`to` dentro del `group_id`) + trigger para
  `expense_participants`.
- **CI** (GitHub Actions): `npm ci` + lint + typecheck + test + build + E2E,
  sin credenciales de Supabase.
- **E2E** con Playwright (flujo completo + escritura offline), corre sin backend.
- Dependencias al día dentro de sus ramas (Next 15.5.x, Vitest 4);
  `npm audit` limpio.

Etapa 7 — **seguridad de acceso (Auth + RLS)** ✅

- **Supabase Anonymous Sign-In**: al configurar Supabase, la app crea una sesión
  anónima (sin email ni contraseña) y la persiste. La publishable key dejó de
  alcanzar: hace falta la sesión para que RLS deje pasar.
- **Membresía** (`group_members`, migración `0005`): quién accede a qué grupo.
  Roles `owner` / `member`. Crear un grupo te deja `owner` automáticamente
  (trigger). `groups.created_by` para auditoría.
- **Invitaciones con token** (`group_invites`, migración `0006`): el UUID del
  grupo ya no da acceso. Se comparte un enlace `/join/<token>` con un token
  aleatorio de 256 bits; el servidor guarda sólo su hash SHA-256. Se revoca y,
  opcionalmente, expira o limita usos. El canje lo valida una RPC
  (`redeem_group_invite`), no el cliente.
- **RLS por `auth.uid()` + `group_members`** (migración `0007`): reemplaza las
  policies `to anon using (true)` de `0002`. Sólo miembros leen/editan un grupo
  y sus movimientos; sólo el owner administra la membresía. Realtime respeta el
  mismo modelo (el socket va autenticado con el JWT).
- **Sin romper offline-first**: sin Supabase la app sigue 100% local e igual que
  antes. Con Supabase, IndexedDB sigue siendo la fuente de la UI; si el servidor
  rechaza un cambio por falta de acceso, el dato local **se conserva** y se
  informa ("Sin acceso al grupo").
- Tests de RLS reales en proceso con `@electric-sql/pglite` (Postgres WASM).

Pendiente

- ⬜ Persistir el cursor entre sesiones (hoy cada sesión arranca con un pull
  completo, que es seguro pero no mínimo).
- ⬜ Cursor a prueba de transacciones solapadas (basado en `pg_snapshot_xmin`);
  hoy la ventana de riesgo es de microsegundos y hay pulls completos de red.
- ⬜ Vincular la sesión anónima a una cuenta real (email / OAuth) para no
  depender del storage del navegador como única llave a los grupos cloud.
- ⬜ UI de reintento manual para los items "sin sincronizar" (agotados).

El diseño completo está en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Activar Supabase

Copiá `.env.example` a `.env.local`, completá `NEXT_PUBLIC_SUPABASE_URL` y
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, y en el proyecto Supabase:

1. Aplicá `supabase/migrations/` en orden (`0001`–`0004` esquema + sync;
   `0005`–`0007` auth + membresía + RLS).
2. **Authentication → Providers → habilitá "Anonymous sign-ins"** (sin esto RLS
   no deja pasar ningún push/pull).
3. Database → Replication: habilitá Realtime para `groups`, `participants`,
   `expenses`, `payments`.

Sin esas variables la app funciona igual, 100% local. Nota: al aplicar `0007`
los grupos creados antes (sin dueño) quedan invisibles; ver el comentario al pie
de `supabase/migrations/0007_rls_auth.sql` para el "claim" manual.

## Scripts

```bash
npm install
npm run dev        # http://localhost:3000
npm run test       # Vitest (dominio + datos + sync)
npm run test:cov   # con cobertura
npm run test:e2e   # Playwright (build + next start + navegador)
npm run typecheck  # tsc --noEmit
npm run lint       # next lint
npm run build      # build de producción
```

Requiere Node ≥ 20.11 (`engines` en `package.json`). La versión exacta está en
`.nvmrc` (`22`); CI y el workflow de release la toman de ahí.

## Versionado y releases

FIVI usa **Semantic Versioning** en `0.x` (pre-1.0). La versión vive en
`package.json` (`0.7.0`) y se muestra en el pie de la pantalla de inicio
(`FIVI v0.7.0 · <commit>`), inyectada en build por `next.config.mjs` — no se
repite a mano en ningún lado.

- Novedades por versión: [`CHANGELOG.md`](CHANGELOG.md).
- Cómo publicar una versión, desplegarla, volver atrás y manejar un hotfix
  —y **cómo afectan las migraciones de Supabase al rollback**—:
  [`docs/RELEASES.md`](docs/RELEASES.md).
- Cada release de producción se marca con un tag anotado `vX.Y.Z`. El workflow
  `.github/workflows/release.yml` valida que el tag coincida con `package.json`,
  corre el gate completo y publica la GitHub Release (no despliega).

## Estructura

```
src/domain/       funciones puras (sin React / Dexie / Supabase)
src/data/         Dexie (v2) + repositorios + consultas
src/sync/         types, entities, queue (backoff), RemotePort, stubRemote,
                  supabaseRemote (cursor + paginación + invitaciones),
                  applyRemoteChanges, accessError, SyncEngine
src/lib/          hooks reactivos (useLiveQuery), supabase (auth anónima),
                  invites (token/hash), formato
src/components/    UI (AppShell, formularios, listas, SyncProvider, SyncBadge,
                  InvitesSection)
src/app/          Next.js App Router (rutas /g/[groupId]/… y /join/[token])
supabase/migrations/  0001 tablas · 0002 realtime+RLS · 0003 sync_revision ·
                  0004 integridad · 0005 membresía · 0006 invitaciones · 0007 RLS auth
scripts/          gen-icons.mjs (iconos PNG de la PWA)
tests/            unit (domain, data, sync) + security (RLS con pglite) + e2e
.github/workflows/ci.yml
```

## Dinero

Todos los importes se guardan y calculan como **enteros** en la unidad monetaria
mínima de la moneda del grupo (ver `src/domain/money.ts`). Nunca floating point
para almacenar. El formateo usa `Intl.NumberFormat`.
