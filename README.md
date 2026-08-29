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

Etapa 3 — **backend Supabase** ✅

- `supabaseRemote`: `push` (upsert por tabla), `pull` incremental por
  `updated_at`, `subscribe` (Realtime por grupo).
- `applyRemoteChanges`: merge de cambios remotos en IndexedDB con
  last-write-wins por `updated_at` + tombstones, sin re-encolar.
- `SyncEngine` aplica el pull, recupera ops interrumpidas y maneja la
  suscripción Realtime con reconciliación por pull.
- Selección automática cloud / local por variables de entorno; Supabase se
  carga de forma diferida (no infla el bundle si no hay credenciales).
- Migración `0002_sync_and_policies.sql` (Realtime + RLS). Iconos PNG.

Pendiente

- ⬜ Aplicar las migraciones contra un proyecto Supabase real y probar el
  camino cloud end to end (requiere credenciales).
- ⬜ Verificar el service worker en Chrome/Edge.
- ⬜ Estrategias de división no equitativas (montos, %, proporciones).

El diseño completo está en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Activar Supabase

Copiá `.env.example` a `.env.local`, completá `NEXT_PUBLIC_SUPABASE_URL` y
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, aplicá `supabase/migrations/` y habilitá
Realtime para `groups`, `participants`, `expenses`, `payments`. Sin esas
variables la app funciona igual, 100% local.

## Scripts

```bash
npm install
npm run dev        # http://localhost:3000
npm run test       # Vitest (dominio + datos)
npm run test:cov   # con cobertura
npm run typecheck  # tsc --noEmit
npm run build      # build de producción
```

## Estructura

```
src/domain/       funciones puras (sin React / Dexie / Supabase)
src/data/         Dexie + repositorios + consultas
src/sync/         cola, RemotePort, stub, supabaseRemote, applyRemoteChanges, SyncEngine
src/lib/          hooks reactivos (useLiveQuery), config de Supabase, formato
src/components/    UI (AppShell, formularios, listas, SyncProvider)
src/app/          Next.js App Router (rutas /g/[groupId]/…)
supabase/         migraciones SQL del servidor
scripts/          gen-icons.mjs (iconos PNG de la PWA)
tests/            unit tests
```

## Dinero

Todos los importes se guardan y calculan como **enteros** en la unidad monetaria
mínima de la moneda del grupo (ver `src/domain/money.ts`). Nunca floating point
para almacenar. El formateo usa `Intl.NumberFormat`.
