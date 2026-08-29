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

Pendiente

- ⬜ `RemotePort` real contra Supabase (push/pull + Realtime + conflictos).
- ⬜ Iconos PNG y verificación del service worker en navegador real.

El diseño completo está en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

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
src/sync/         cola, RemotePort, stub y SyncEngine
src/lib/          hooks reactivos (useLiveQuery) y formato
src/components/    UI (AppShell, formularios, listas, SyncProvider)
src/app/          Next.js App Router (rutas /g/[groupId]/…)
supabase/         migración SQL del servidor (todavía sin aplicar)
tests/            unit tests
```

## Dinero

Todos los importes se guardan y calculan como **enteros** en la unidad monetaria
mínima de la moneda del grupo (ver `src/domain/money.ts`). Nunca floating point
para almacenar. El formateo usa `Intl.NumberFormat`.
