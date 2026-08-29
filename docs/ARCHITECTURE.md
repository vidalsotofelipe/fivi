# fivi — Arquitectura

> Documento requerido por la sección 40 del brief: definir estas decisiones
> **antes** de implementar el MVP completo. Cubre los 15 puntos pedidos.

fivi es una PWA para dividir gastos entre un grupo, estilo Splitwise, enfocada
en simplicidad, velocidad y funcionamiento **offline-first / local-first**. Un
grupo trabaja con **una sola moneda** y no hay conversión de divisas.

---

## 1. Arquitectura general

Capas, de arriba hacia abajo (sección 34). Cada capa sólo habla con la
inmediatamente inferior:

```
UI (Next.js App Router, React)
        │  useLiveQuery / hooks
Servicios de dominio  (src/domain, funciones puras)
        │
Repositorio local     (src/data, Dexie sobre IndexedDB)
        │
Motor de sincronización (src/sync, procesa sync_queue)
        │  RemotePort (interfaz)
Repositorio remoto     (Supabase — implementación futura)
```

Reglas:

- La UI **nunca** llama a Supabase directamente; lee siempre de IndexedDB.
- El dominio no importa React, Dexie ni Supabase: son funciones puras testeables.
- El motor de sync es el único que conoce `RemotePort`.

Estado de la implementación en esta etapa: dominio ✓, datos locales ✓, motor de
sync con stub ✓. Pantallas del producto y `RemotePort` real contra Supabase:
etapa siguiente.

## 2. Modelo de datos local

IndexedDB vía Dexie (`src/data/db.ts`, base `fivi`, versión 1). Stores:

| Store                  | Índices                                                        |
| ---------------------- | ------------------------------------------------------------- |
| `groups`               | id, updated_at, deleted_at                                    |
| `participants`         | id, group_id, updated_at, deleted_at                          |
| `expenses`             | id, group_id, paid_by, expense_date, updated_at, deleted_at   |
| `expense_participants` | id, expense_id, participant_id, updated_at, deleted_at        |
| `payments`             | id, group_id, from_participant, to_participant, payment_date… |
| `settings`             | key                                                          |
| `sync_queue`           | id, sync_status, entity_type, entity_id, created_at           |

Toda entidad sincronizable (`SyncableRecord` en `src/domain/types.ts`) tiene:
`id` (UUID), `created_at`, `updated_at`, `version`, `deleted_at`.

Dinero: `amount_minor_units` / `share_minor_units` son **enteros** en la unidad
mínima de la moneda del grupo.

## 3. Modelo de datos remoto

Postgres en Supabase, espejo del modelo local. SQL completo en
`supabase/migrations/0001_init.sql` (listo, **no aplicado** en esta etapa).
Tablas: `groups`, `participants`, `expenses`, `expense_participants`,
`payments`, con los mismos campos + `version` + `deleted_at`, PK `uuid` generada
en el cliente, índices por `group_id` y `updated_at` (para el pull incremental).
RLS y políticas se definirán junto con la sincronización real.

## 4. Flujo de usuario

Pantallas (sección 11), implementadas como rutas del App Router
(`/`, `/nuevo`, `/g/[groupId]`, `/g/[groupId]/gastos`, `.../gastos/nuevo`,
`.../gastos/[expenseId]`, `.../balance`, `.../pagos/nuevo`, `.../config`):

```
Inicio (grupos recientes)
 ├─ Crear grupo (nombre, descripción, moneda*)
 └─ Grupo (resumen: total, balances, transferencias, historial)
     ├─ Agregar gasto → Editar gasto
     ├─ Balance por persona
     ├─ Registrar pago
     └─ Configuración del grupo (moneda editable sólo sin movimientos)
```

Regla de interacción transversal (sección 20): toda acción se refleja
**inmediatamente**; nunca se espera al servidor para mostrar el resultado. La
UI lee de IndexedDB con `useLiveQuery` (`src/lib/db-hooks.ts`): al escribir en
local, la pantalla se re-renderiza sola. El estado del grupo + participantes se
carga una vez en `g/[groupId]/layout.tsx` y se comparte por contexto
(`GroupProvider`).

## 5. Estrategia PWA

- `public/manifest.webmanifest`: `display: standalone`, `start_url: /`, icono
  SVG `any maskable`, `theme_color`.
- `public/sw.js` (hecho a mano, sin dependencias):
  - `install`: precache del app shell (`/`, manifest) + `skipWaiting`.
  - `activate`: borra caches viejas + `clients.claim`.
  - `fetch`:
    - navegaciones → **network-first** con fallback a cache y a `/`;
    - `/_next/static/*` → **cache-first** (assets inmutables);
    - resto → **stale-while-revalidate**.
  - Los **datos no se cachean acá**: viven en IndexedDB.
- Registro en `src/app/sw-register.tsx`, sólo en producción.
- Actualización: al publicar una versión nueva cambia `VERSION` en `sw.js`; el
  SW nuevo hace `skipWaiting` + `clients.claim`. (Mejora futura: aviso "hay una
  versión nueva, recargar".)
- Instalación **opcional**: no se fuerza el prompt.

## 6. Estrategia offline-first

Flujo de toda mutación (secciones 13 y 20):

```
acción del usuario
  → escribir en IndexedDB           (repositorio local, transacción)
  → encolar op en sync_queue        (misma transacción)
  → la UI se actualiza al instante  (lee de IndexedDB)
  → sincronizar cuando haya conexión (motor de sync)
```

Sin conexión (sección 15) el usuario puede: abrir la app, ver grupos/
participantes/gastos ya cargados, crear/editar/eliminar gastos, registrar
pagos, ver balances y "quién le paga a quién", agregar participantes, editar
datos básicos del grupo. **Todos los cálculos corren localmente.**

## 7. Algoritmo de sincronización

Motor: `src/sync/SyncEngine.ts`. Una corrida (`syncNow()`), reentrante-segura:

1. Si no hay conexión → marca estado `offline` y sale.
2. **Push**: toma de `sync_queue` los items `pending` (y `error` con
   `attempts < 5`), los marca `syncing`, llama `remote.push(items)`, marca
   `synced` los aceptados y `error` (+`attempts`) los rechazados.
3. **Pull**: `remote.pull({ group_ids, since: last_synced_at })`. En esta etapa
   se ejecuta pero la aplicación de cambios remotos queda pendiente.
4. Limpia de la cola los `synced` (`purgeSynced`).
5. Emite estado: `online`, `syncing`, `pending_count`, `last_synced_at`,
   `last_error`.

Disparadores (sección 17), vía `start()`: al iniciar la app, evento `online`,
`visibilitychange` a visible, y polling suave (30 s) mientras haya conexión.
Background Sync se usará **si existe**, nunca como única vía.

### Cola de sincronización (`sync_queue`, sección 18)

Campos: `id`, `operation` (`CREATE|UPDATE|DELETE`), `entity_type`, `entity_id`,
`payload` (estado completo de la entidad), `created_at`, `attempts`,
`last_attempt_at`, `sync_status` (`pending|syncing|synced|error`), `error`.

## 8. Estrategia de resolución de conflictos

MVP, simple y predecible (sección 22):

- Cada registro lleva `version` (incrementa en cada cambio local) y
  `updated_at`.
- El servidor detecta conflicto cuando la `version` entrante no es la esperada.
- Resolución: **last-write-wins por `updated_at`**. Nunca sobrescritura
  silenciosa sin comparar versión.
- Borrados: `deleted_at` (tombstone), nunca hard delete; así la eliminación se
  propaga entre dispositivos.

Ruta de mejora (no ahora): merge por campo, CRDT para listas de participantes,
o cola de conflictos para resolución manual. La forma de los datos ya lo
permite.

## 9. Algoritmo de balances

`src/domain/balances.ts`, funciones puras (sección 35):

```
paid[p]  = Σ gastos pagados por p          + Σ pagos enviados por p
owed[p]  = Σ parte de p en cada gasto      + Σ pagos recibidos por p
balance[p] = paid[p] - owed[p]
```

- `balance > 0`: debe recibir. `< 0`: debe pagar. `= 0`: equilibrado.
- Invariante: `Σ balance == 0`. Si hay residuo por inconsistencias de redondeo,
  se corrige de forma determinística sobre el participante de menor `id`.

## 10. Algoritmo de simplificación de deudas

`src/domain/settlement.ts` → `simplifyDebts(balances): Transfer[]` (sección 8):

- Se separan acreedores (`balance > 0`) y deudores (`balance < 0`).
- Greedy: se ordena por monto desc/asc (desempate por `id`), se empareja el
  mayor acreedor con el mayor deudor y se transfiere `min(|a|, |b|)`; se repite.
- Produce **≤ n−1** transferencias. Todo en enteros de unidad mínima.
- Determinístico: mismo input ⇒ mismo output en todos los dispositivos.

## 11. Manejo de monedas

`src/domain/currencies.ts`:

- Catálogo con `code`, `name`, `decimal_digits`, `locale`. Destacadas: ARS, USD,
  EUR, BRL, CLP (0 dec), UYU, GBP, MXN (+ JPY de ejemplo, 0 dec).
- `getCurrencyInfo(code)`: si el código no está en el catálogo, deriva los
  decimales de `Intl` y cae en `DEFAULT_DECIMAL_DIGITS = 2`.
- La moneda del grupo es **obligatoria** al crear y **inmutable** una vez que el
  grupo tiene gastos o pagos (`groupRepo.changeGroupCurrency` lanza el mensaje
  exacto para la UI).

## 12. Unidades monetarias mínimas

`src/domain/money.ts` — utilidad central, el resto de las capas no reimplementa
aritmética de dinero:

- `minorFromDecimal(value, code)` / `fromMinorUnits(minor, code)`: conversión
  usando `10 ** decimal_digits`.
- `toMinorUnits(input, code)`: parsea texto del usuario, **locale-aware** (usa
  los separadores de miles/decimal de la moneda). Descarta símbolos y espacios.
- `formatMoney(minor, code, locale?)`: `Intl.NumberFormat` con `style:
  "currency"`, respetando los decimales de la moneda.
- Todos los cálculos se hacen con **enteros**.

## 13. Estrategia de redondeo

`distributeMinor(totalMinor, n)` en `money.ts`, reutilizada por `splitEqually`:

- `base = floor(total / n)`, `remainder = total − base·n`.
- Las `remainder` unidades sobrantes se asignan de a **1** a las primeras
  porciones, con los participantes **ordenados por `id`**.
- `Σ porciones == total` exacto. Soporta montos negativos.
- Ejemplo: $100 entre 3 → `33,34 / 33,33 / 33,33` (suma `100,00`).

## 14. Estructura de carpetas

```
fivi/
  docs/ARCHITECTURE.md
  public/            manifest.webmanifest, sw.js, icons/icon.svg
  src/
    app/             layout.tsx, page.tsx, sw-register.tsx, globals.css
    domain/          types, currencies, money, split, balances, settlement (puro)
    data/            db, ids, queries, repositories/{group,participant,expense,payment}Repo
    sync/            types, RemotePort, stubRemote, queue, SyncEngine
  supabase/migrations/0001_init.sql
  tests/             domain/*.test.ts, data/*.test.ts
```

Alias `@/*` → `src/*` (tsconfig + vitest).

## 15. Tests principales

`npm run test` (Vitest). Cubierto en esta etapa (sección 36):

- División: 2 y 4 personas; quien paga participa / no participa; división con
  redondeo con suma exacta; determinismo.
- Balances: varios gastos acumulados; pagos parciales y completos; participante
  con balance cero; suma-cero con divisiones no exactas.
- Simplificación: caso del brief (4 personas → 3 transferencias); ≤ n−1;
  determinismo; el grupo queda saldado.
- Monedas: parseo y formato con distinta cantidad de decimales (CLP vs USD).
- Datos: crear offline genera fila + op `pending` en `sync_queue`; soft delete
  setea `deleted_at` y encola `DELETE`; `version` incrementa en updates.
- Sync: `SyncEngine` + `stubRemote` procesa la cola y deja `pending_count = 0`;
  marca `error` + `attempts` en rechazos.

Pendiente para la etapa siguiente: creación/edición/eliminación offline desde la
UI, sincronización posterior real y conflictos de versiones contra Supabase.

---

## Decisiones de stack

| Área             | Elección                     | Motivo                                            |
| ---------------- | ---------------------------- | ------------------------------------------------ |
| Framework        | Next.js 15 (App Router)      | Pedido en el brief; buen soporte PWA/estático.   |
| Lenguaje         | TypeScript estricto          | `noUncheckedIndexedAccess` activado.             |
| Estilos          | Tailwind CSS                 | Pedido en el brief.                              |
| DB local         | Dexie sobre IndexedDB        | Abstracción mantenible sobre IndexedDB.          |
| DB remota        | Supabase / Postgres          | Pedido en el brief.                              |
| Tests            | Vitest + fake-indexeddb      | Rápido; permite testear repos sin navegador.     |
| PWA              | Manifest + SW a mano         | Sección 33: evitar dependencias innecesarias.    |
| Estado UI ↔ datos | `dexie-react-hooks` (etapa 2) | `useLiveQuery` mantiene la UI viva desde IndexedDB. |
