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
Repositorio remoto     (stubRemote sin red  |  supabaseRemote — Postgres + Realtime)
```

Reglas:

- La UI **nunca** llama a Supabase directamente; lee siempre de IndexedDB.
- El dominio no importa React, Dexie ni Supabase: son funciones puras testeables.
- El motor de sync es el único que conoce `RemotePort`.
- La app funciona **completa sin Supabase configurado** (usa `stubRemote`).

Todo implementado: dominio, datos locales, pantallas, `supabaseRemote` real
(push/pull/Realtime), verificado contra un proyecto Supabase.

## 2. Modelo de datos local

IndexedDB vía Dexie (`src/data/db.ts`, base `fivi`). Stores:

| Store                  | Índices                                                        |
| ---------------------- | ------------------------------------------------------------- |
| `groups`               | id, updated_at, deleted_at                                    |
| `participants`         | id, group_id, updated_at, deleted_at                          |
| `expenses`             | id, group_id, paid_by, expense_date, updated_at, deleted_at   |
| `expense_participants` | id, expense_id, participant_id, updated_at, deleted_at        |
| `payments`             | id, group_id, from_participant, to_participant, payment_date… |
| `settings`             | key                                                          |
| `sync_queue`           | id, sync_status, entity_type, entity_id, created_at, next_attempt_at |

Toda entidad sincronizable (`SyncableRecord` en `src/domain/types.ts`) tiene:
`id` (UUID), `created_at`, `updated_at`, `version`, `deleted_at`.

**Versiones de la base** (nunca se destruyen datos; migraciones aditivas):

- **v1** — esquema inicial.
- **v2** — agrega `next_attempt_at` al índice de `sync_queue` (backoff, §16.1);
  rellena las filas existentes con `null` en el `upgrade`.

Dinero: `amount_minor_units` / `share_minor_units` son **enteros** en la unidad
mínima de la moneda del grupo.

## 3. Modelo de datos remoto

Postgres en Supabase, espejo del modelo local. Migraciones en
`supabase/migrations/` (nunca se editan retroactivamente; sólo se agregan):

| # | Contenido |
| - | --------- |
| `0001_init.sql` | tablas con los campos de `SyncableRecord`, PK `uuid` del cliente, FKs e índices |
| `0002_sync_and_policies.sql` | Realtime + RLS permisiva para `anon` (reemplazada por `0007`) |
| `0003_sync_revision.sql` | columna server-owned `sync_revision` (secuencia + trigger) — cursor de pull (§16.2) |
| `0004_referential_integrity.sql` | FKs compuestas + trigger de integridad cross-group (§16.4) |
| `0005_membership.sql` | `groups.created_by`, tabla `group_members`, helpers `is_group_member` / `is_group_owner`, trigger que hace `owner` al creador (§17) |
| `0006_invites.sql` | tabla `group_invites` (hash del token), RPC `redeem_group_invite` (§17) |
| `0007_rls_auth.sql` | RLS por `auth.uid()` + `group_members`; reemplaza las policies `to anon` de `0002` (§17) |
| `0008_groups_select_creator.sql` | `groups_select` también permite `created_by = auth.uid()` — arregla `INSERT … RETURNING` en `groups` (§17.4) |

La app funciona 100% local sin aplicarlas. Las migraciones nunca se editan
retroactivamente: `0007` **elimina** las policies de `0002` con `drop policy if
exists` en vez de tocar ese archivo.

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

- `public/manifest.webmanifest`: `display: standalone`, `start_url: /`,
  `theme_color`, iconos PNG 192/512 + maskable 512 + SVG. Los PNG se generan con
  `npm run gen:icons` (encoder a mano, sin tooling de imágenes).
- `public/sw.js` (hecho a mano, sin dependencias):
  - `install`: precache del app shell (`/`, `/nuevo`, manifest) + `skipWaiting`.
  - `activate`: borra caches viejas + `clients.claim`.
  - `fetch`:
    - navegaciones y RSC de **rutas de grupo** (`/g/<id>/…`) → network-first con
      **clave de cache normalizada** a `/g/_/…`. Como toda la página es client
      component y el id se lee en runtime, un único shell sirve para todos los
      grupos → con una visita quedan disponibles offline **todos** los grupos.
    - otras navegaciones → network-first con fallback a `/`;
    - `/_next/static/*` → **cache-first** (assets inmutables);
    - resto → **stale-while-revalidate**.
  - Los **datos no se cachean acá**: viven en IndexedDB.
- Registro en `src/app/sw-register.tsx`, sólo en producción. Al activarse, si hay
  conexión, "prewarmea" los shells de grupo (`fetch` a `/g/<placeholder>/…`) para
  que la normalización cachee `/g/_/…` sin necesidad de haber abierto un grupo.
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

Motor: `src/sync/SyncEngine.ts`. Una corrida (`syncNow(force?)`), reentrante-segura:

1. Si ya hay una corrida en curso → agenda una repetición (`rerunRequested`) y sale.
2. Si no hay conexión → emite `offline` + contadores y sale.
3. Si la corrida completa anterior falló y no pasó el backoff a nivel corrida
   (`nextRunAllowedAt`) → sale, **salvo** `force` (disparo del usuario).
4. `requeueStaleSyncing`: devuelve a `pending` lo que quedó en `syncing` de una
   corrida anterior interrumpida.
5. **Push**: toma de `sync_queue` los items elegibles (`getPendingItems`:
   `pending` + `error` cuya ventana de backoff venció y `attempts < 5`; con
   `force` ignora la ventana). Los marca `syncing`, llama `remote.push(items)`
   (upsert en orden de dependencia), marca `synced` los aceptados y `error`
   (+`attempts` + `next_attempt_at`) los rechazados. Si `remote.push` **lanza**
   (red caída), los items marcados van a `error` con backoff (no quedan en
   `syncing`) y se propaga el error.
6. **Pull**: `changes = remote.pull({ group_ids, cursor })` y
   `applyRemoteChanges(changes)` los mergea con LWW (§8). `cursor` es el máximo
   `sync_revision` aplicado (server-owned, §16.2); `null` = pull completo
   (arranque, reconexión, grupo nuevo por enlace). Tras aplicar, el cursor
   avanza al máximo `sync_revision` recibido.
7. Limpia de la cola los `synced` (`purgeSynced`).
8. `refreshSubscription(groupIds)`: (re)suscribe Realtime si cambió el conjunto.
9. Emite estado: `online`, `syncing`, `pending_count`, `exhausted_count`,
   `last_synced_at` (sólo display), `last_error`, `hydrating_group_ids`.

Disparadores (sección 17), vía `start()`: al iniciar la app (`force`), evento
`online` (`force`), `visibilitychange` a visible (`force`), polling suave (20 s),
tras cada mutación local (`SyncProvider` dispara `syncNow` cuando sube el
`pending`), y cada evento Realtime (aplica el cambio + agenda un pull de
reconciliación con debounce). Background Sync se usará **si existe**, nunca como
única vía.

### Realtime (sección 32)

`supabaseRemote.subscribe({ group_ids, onChange })` abre un canal con
`postgres_changes` filtrado por `group_id` para `groups`, `participants`,
`expenses` y `payments`. Cada evento: `onChange` → `applyRemoteChanges` →
`scheduleReconcile` (pull con debounce de 800 ms que trae, entre otras cosas,
las `expense_participants`, que no viajan por Realtime). La UI, que lee de
IndexedDB con `useLiveQuery`, se actualiza sola.

### Cola de sincronización (`sync_queue`, sección 18)

Campos: `id`, `operation` (`CREATE|UPDATE|DELETE`), `entity_type`, `entity_id`,
`payload` (estado completo de la entidad), `created_at`, `attempts`,
`last_attempt_at`, `next_attempt_at` (backoff, §16.1), `sync_status`
(`pending|syncing|synced|error`), `error`.

## 8. Estrategia de resolución de conflictos

Implementada en `src/sync/applyRemoteChanges.ts` (`shouldApply`), MVP simple y
predecible (sección 22):

- Cada registro lleva `version` (incrementa en cada cambio local) y `updated_at`
  (reloj del cliente que escribió).
- Al recibir una fila remota: si no hay local → se aplica. Si hay local →
  **last-write-wins por `updated_at`**; empate → gana `version` mayor; si el
  local es más nuevo, el remoto se **descarta** (nunca se pisa en silencio).
- El servidor NO reescribe `updated_at` en el `upsert` (migración `0002`), así
  que la comparación es consistente entre dispositivos.
- Borrados: `deleted_at` (tombstone), nunca hard delete; la eliminación se
  propaga como cualquier otro cambio.
- `applyRemoteChanges` escribe **directo en las tablas**, sin pasar por los
  repositorios, para no re-encolar en `sync_queue` lo que vino del servidor.

Ruta de mejora (no ahora): merge por campo, CRDT para listas de participantes,
o cola de conflictos para resolución manual. La forma de los datos ya lo
permite.

## 8b. Backend Supabase

- `src/lib/supabaseConfig.ts` lee `NEXT_PUBLIC_SUPABASE_URL` /
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` (sin importar la librería).
- Si hay credenciales, `SyncProvider` carga `@supabase/supabase-js` de forma
  **diferida**, asegura una **sesión anónima** (`ensureAnonymousSession`, §17) y
  reinicia el motor con `supabaseRemote`; si no, usa `stubRemote` y el indicador
  muestra "En este dispositivo". El bundle base no crece.
- Todo push/pull/Realtime va **autenticado** con el JWT de la sesión anónima: RLS
  (§17) sólo deja ver/editar los grupos donde el usuario es miembro. La
  publishable key por sí sola no alcanza.
- `supabase/migrations/`: `0001` (tablas), `0002` (Realtime), `0003`–`0004`
  (hardening, §16), `0005`–`0007` (auth + membresía + RLS, §17). Puesta en marcha
  en `.env.example`.
- `supabaseRemote.push`: cada op de la cola es un `upsert` del payload (los
  borrados viajan como filas con `deleted_at`), agrupado por tabla y ejecutado
  en **orden de dependencia** (`groups → participants → expenses →
  expense_participants → payments`) para no chocar con las FKs compuestas (§16.4).
- `supabaseRemote.pull`: filas con `sync_revision > cursor` (§16.2), ordenadas
  por `sync_revision`, **paginadas** (`PULL_PAGE_SIZE = 500`, §16.3). Las
  `expense_participants` (sin `group_id`) se traen por `expense_id` (ids
  paginados y en tandas de 200 para el `.in(...)`).
- **Acceso por enlace** (sección 31): el pull sólo alcanza los grupos que el
  cliente conoce. `GroupLayout` llama `requestGroup(id)` al montar; el motor
  (`SyncEngine.trackGroup`) suma ese id a los pulls y fuerza un pull completo.
  Desde la Etapa 7 `trackGroup` **pide** pero no **otorga**: con RLS, el pull
  devuelve el grupo sólo si el usuario ya es miembro. Para entrar a un grupo
  nuevo hay que canjear una invitación (`/join/<token>`, §17).
- El remoto se cambia en caliente con `SyncEngine.setRemote` (stub → Supabase
  cuando termina el import diferido), sin recrear el motor.
- **Verificado** contra un proyecto Supabase real: push (grupo + participantes +
  gasto + porciones), pull en dispositivo nuevo por enlace, Realtime (cambio
  externo → UI en vivo) y edición cliente → servidor.

## 8c. Formas de dividir un gasto (sección 5)

`src/domain/split.ts` → `computeShares(totalMinor, participantIds, strategy)`.
`SplitStrategy` es una unión discriminada; **todas** garantizan que las
porciones suman exactamente el total.

| `kind`    | Entrada                              | Cálculo |
| --------- | ----------------------------------- | ------- |
| `equal`   | —                                   | `distributeMinor` (base + resto a los primeros ids) |
| `amount`  | monto por participante (min. units) | son las porciones; se valida que sumen el total |
| `percent` | porcentaje por participante         | `distributeByWeights` (resto mayor / Hamilton) |
| `shares`  | peso o cantidad de partes           | `distributeByWeights` — sólo importan las proporciones |

`percent` y `shares` comparten el motor (`distributeByWeights`): reparte en
proporción a los pesos y asigna las unidades sobrantes a las fracciones más
grandes, con desempate por índice → determinístico. La UI
(`components/ExpenseForm.tsx`) tiene un selector de 4 opciones e inputs por
participante; usa el mismo `computeShares` para validar y previsualizar en vivo.

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
  public/            manifest.webmanifest, sw.js, icons/ (svg + png 192/512/maskable)
  scripts/gen-icons.mjs
  src/
    app/             layout, page, sw-register, globals.css, rutas /g/[groupId]/…
    domain/          types, currencies, money, split, balances, settlement (puro)
    data/            db, ids, queries, repositories/{group,participant,expense,payment}Repo
    sync/            types, entities, RemotePort, stubRemote, supabaseRemote,
                     applyRemoteChanges, queue, SyncEngine
    lib/             supabaseConfig, supabase, db-hooks, format, cn
    components/       AppShell, Button, fields, CurrencySelect, MoneyInput,
                     ExpenseForm, BalanceList, TransferList, SyncProvider, SyncBadge
  supabase/migrations/  0001…0004 (ver §3)
  tests/             domain/*.test.ts, data/*.test.ts, sync/*.test.ts, e2e/*.spec.ts
  .github/workflows/ci.yml
```

Alias `@/*` → `src/*` (tsconfig + vitest). Node ≥ 20.11 (`engines`).

## 15. Tests principales

`npm run test` (Vitest). Cubierto en esta etapa (sección 36):

- División: `equal` (2 y 4 personas, redondeo con suma exacta, determinismo);
  `amount` (usa los montos / rechaza si no suman el total / no negativos);
  `percent` y `shares` (`distributeByWeights`: proporciones, resto mayor,
  determinismo, rechaza suma cero). `computeShares` siempre suma el total.
- Balances: varios gastos acumulados; pagos parciales y completos; participante
  con balance cero; suma-cero con divisiones no exactas.
- Simplificación: caso del brief (4 personas → 3 transferencias); ≤ n−1;
  determinismo; el grupo queda saldado.
- Monedas: parseo y formato con distinta cantidad de decimales (CLP vs USD).
- Datos: crear offline genera fila + op `pending` en `sync_queue`; soft delete
  setea `deleted_at` y encola `DELETE`; `version` incrementa en updates; gasto
  con `split_strategy: amount` guarda porciones exactas y rechaza si no suman.
- Sync: `SyncEngine` + `stubRemote` procesa la cola y deja `pending_count = 0`;
  marca `error` + `attempts` en rechazos; recupera items en `syncing`; aplica
  en local los cambios del pull.
- Conflictos: `shouldApply` (LWW por `updated_at`, desempate por `version`);
  `applyRemoteChanges` inserta lo nuevo, respeta lo local más nuevo, aplica
  tombstones y no re-encola.
- Supabase (`supabaseRemote`) con cliente fake: `push` agrupa por tabla y hace
  `upsert` **en orden de dependencia**; `pull` mapea filas a `RemoteChange`,
  filtra por `cursor` (`sync_revision`) y **pagina** (junta > `PULL_PAGE_SIZE`).
- Backoff (`tests/sync/backoff.test.ts`): `backoffDelayMs` crece exponencial con
  jitter y tope; un `error` no se reintenta hasta que vence `next_attempt_at`;
  tras `MAX_ATTEMPTS` queda "agotado"; un item fallido no bloquea a otros;
  `SyncEngine` con red caída aplica backoff a nivel corrida (no reintenta sin
  `force` hasta pasar la ventana).
- Cursor: primer pull `cursor = null`, el siguiente usa el máximo `sync_revision`.
- **Auth + invitaciones** (`tests/sync/auth.test.ts`, `tests/sync/invites.test.ts`):
  `ensureAnonymousSession` firma sólo si no hay sesión y autoriza Realtime;
  `SyncEngine.redeemInvite` canjea y hace `trackGroup`; `createInvite` manda el
  hash y nunca el token crudo; el hash coincide con `sha256` de Node/Postgres.
- **RLS reales** (`tests/security/rls.test.ts`, `@electric-sql/pglite`): ver §17.8.
- **Acceso denegado / offline** (`tests/data/sync.test.ts`): un rechazo `42501`
  no borra el dato local y emite `access_error`; un pull vacío no borra el grupo;
  el CRUD local sigue con el remoto inalcanzable.
- E2E (`tests/e2e/`, Playwright, sin Supabase): flujo completo (grupo →
  participantes → gasto → balance → pago → editar → borrar) y escritura offline
  (agregar participante / renombrar grupo con `context.setOffline(true)`).

## 16. Hardening (cursor, backoff, paginación, integridad, CI)

### 16.1 Backoff real de la cola

`src/sync/queue.ts`. Cada item lleva `next_attempt_at`. Al fallar:
`attempts++`, se guarda `error` y se fija `next_attempt_at = now +
backoffDelayMs(attempts)` — *equal jitter*: `mitad_fija + random·mitad` sobre
`BASE_DELAY_MS·2^(attempts-1)`, con techo `MAX_DELAY_MS` (5 min). `MAX_ATTEMPTS`
= 5 (configurable). `getPendingItems` sólo devuelve `error` con ventana vencida
y `attempts < MAX_ATTEMPTS`; los agotados se cuentan aparte (`exhausted_count`,
badge rojo). `SyncEngine` además frena corridas completas repetidas
(`nextRunAllowedAt`) para no machacar durante una caída; los disparos del
usuario (`force`) pasan igual e ignoran las ventanas por item.

### 16.2 Cursor de sincronización server-owned

**Problema**: el pull incremental usaba `updated_at > since` con `updated_at` y
`since` generados por el **reloj del cliente**. Con relojes desincronizados un
dispositivo atrasado escribe en el pasado y otro nunca ve esa fila (cambio
perdido); uno adelantado provoca re-traer filas en cada pull.

**Solución** (migración `0003`): columna `sync_revision bigint` en las 5 tablas,
asignada por una **secuencia global** de Postgres mediante un **trigger BEFORE
INSERT OR UPDATE** que sobrescribe cualquier valor del cliente. El pull usa
`sync_revision > cursor ORDER BY sync_revision`; el motor avanza el cursor al
máximo recibido. Es monotónico y no depende de ningún reloj.

**No cambia la resolución de conflictos**: `applyRemoteChanges` sigue con LWW por
`updated_at` (+ `version`). `sync_revision` sólo responde "qué falta traer".

**Cursor en memoria por sesión**: cada sesión arranca con un pull completo
(`cursor = null`, seguro) y usa el cursor para los incrementales dentro de la
sesión. También se fuerza pull completo al reconectar y al abrir un grupo nuevo
por enlace (sus filas tienen `sync_revision` < cursor). Persistirlo entre
sesiones es una optimización pendiente.

**Limitación conocida**: una secuencia puede dejar "huecos" si dos transacciones
se solapan (una toma `nextval` antes y commitea después que otra). En fivi todas
las escrituras son upserts de una fila en autocommit → ventana de microsegundos,
y los pulls completos de arranque/reconexión la tapan. Endurecerlo (cursor
basado en `pg_snapshot_xmin`) queda pendiente.

### 16.3 Paginación del pull

PostgREST corta las respuestas grandes (~1000 filas). `supabaseRemote.pull`
recorre **todas las páginas** de cada tabla con `.range(from, from+499)` hasta
que una página trae < `PULL_PAGE_SIZE`. Los ids de `expenses` para traer
`expense_participants` también se piden paginados y el `.in(...)` se trocea en
tandas de 200. Cubierto por test con > `PULL_PAGE_SIZE` filas.

### 16.4 Integridad referencial en el servidor

Migración `0004`. Garantiza en Postgres (aunque el cliente tenga un bug):

- `unique (group_id, id)` en `participants` como destino de FKs compuestas;
- `expenses (group_id, paid_by) → participants (group_id, id)`;
- `payments (group_id, from_participant)` y `(group_id, to_participant) →
  participants (group_id, id)`;
- **trigger** `check_expense_participant_group` en `expense_participants`
  (no tiene `group_id`): valida que el participante pertenezca al grupo del
  expense.

Estas restricciones actúan en el **push**. El motor pushea en orden de
dependencia, así que un lote válido nunca se rechaza por orden; una fila que
referencia algo que todavía no llegó se rechaza, vuelve a la cola y reintenta
con backoff. `applyRemoteChanges` (pull → IndexedDB) no las toca.

### 16.5 CI

`.github/workflows/ci.yml`, en `push` y `pull_request`:

- job **verify**: `npm ci` → `lint` → `typecheck` → `test` → `build`
  (+ `npm audit --audit-level=high` informativo). Node 22, caché npm.
- job **e2e**: `npm ci` → `playwright install --with-deps chromium` →
  `test:e2e` (Playwright levanta `next build && next start`).
- **Sin credenciales de Supabase**: todo corre con la app en modo local.
- La versión de Node sale de `.nvmrc` (`22`), no está hardcodeada en el workflow.

### 16.6 Versionado y releases

- **SemVer** en `0.x`; la versión es la de `package.json`. Se inyecta en build
  (`next.config.mjs` → `NEXT_PUBLIC_APP_VERSION` / `_COMMIT` / `_ENV`), la lee
  `src/lib/appInfo.ts` y la muestra `AppVersion` en el pie del inicio. Sin
  duplicación manual.
- Cada release de producción se etiqueta `vX.Y.Z` (tag anotado sobre el commit
  desplegado). `.github/workflows/release.yml` valida `tag == package.json`,
  corre lint+typecheck+test+build y publica la GitHub Release (no despliega).
- Procedimiento completo, rollback de frontend y **efecto de las migraciones
  Supabase sobre el rollback** (Expand→Migrate→Contract, clasificación de
  compatibilidad, `0005`–`0007` marcadas ROLLBACK RISK): `docs/RELEASES.md`.
- Novedades por versión: `CHANGELOG.md`.

---

## 17. Autenticación y control de acceso (Etapa 7)

Hasta la Etapa 6, el acceso a un grupo en el backend era "conocer el UUID =
acceso total" (`0002`: policies `to anon using (true)`). La Etapa 7 lo reemplaza
por **Supabase Anonymous Sign-In + RLS por membresía**, sin pedir email ni
contraseña y **sin romper local-first**.

### 17.1 Autenticación anónima

- `src/lib/supabase.ts`: el cliente se crea con `persistSession: true` +
  `autoRefreshToken: true` (sesión en `localStorage`, mecanismo estándar).
- `ensureAnonymousSession(client)`: si no hay sesión, `signInAnonymously()`;
  luego `client.realtime.setAuth(access_token)` (necesario para que Realtime
  respete RLS por suscriptor).
- `SyncProvider` la llama tras el import diferido y **antes** de `setRemote`. Si
  falla (sign-in anónimo deshabilitado, o sin red al arrancar) se pasa a cloud
  igual: los push/pull fallan por RLS y quedan pendientes; se reintenta
  `ensureAnonymousSession` al volver la conexión y en cada `TOKEN_REFRESHED`.
- **Sin Supabase configurado no hay auth**: `stubRemote`, todo 100% local, igual
  que antes.

### 17.2 Membresía (`0005`)

- `group_members(group_id, user_id, role)` — `role ∈ {owner, member}`. Sin
  `admin`: el `owner` cubre lo sensible.
- `groups.created_by` lo fija un trigger `BEFORE INSERT` (= `auth.uid()`, el
  cliente no lo puede falsear). Un trigger `AFTER INSERT` (`SECURITY DEFINER`)
  hace `owner` al creador. El cliente **no** maneja `group_members` al crear.
- Helpers `is_group_member(uuid)` / `is_group_owner(uuid)` — `SECURITY DEFINER
  STABLE`, `search_path=''`. `SECURITY DEFINER` evita la recursión de RLS (una
  policy sobre `group_members` que lee `group_members`).

### 17.3 Invitaciones (`0006`)

- El UUID del grupo ya no autoriza. Se comparte `/join/<token>`:
  - `token` = 256 bits aleatorios en base64url (`src/lib/invites.ts`), vive sólo
    en el enlace;
  - el servidor guarda **sólo** `sha256(token)` en `group_invites.token_hash`
    (`sha256`/`convert_to` del core de Postgres, sin pgcrypto);
  - se revoca (`revoked_at`) y opcionalmente expira (`expires_at`) o limita usos
    (`max_uses`).
- **Canje**: RPC `redeem_group_invite(p_token text)` (`SECURITY DEFINER`). Valida
  `auth.uid()`, vigencia y revocación **en el servidor**, agrega al usuario a
  `group_members` (`on conflict do nothing` → doble canje es idempotente y no
  infla `uses`) y devuelve el `group_id`. El cliente sólo orquesta
  (`SyncEngine.redeemInvite` → `trackGroup` → navegar).
- Cualquier miembro crea invitaciones (`created_by` lo fija un trigger); revoca
  el owner o quien la creó.
- `RemotePort` gana métodos **opcionales** (`createInvite`, `redeemInvite`,
  `listInvites`, `revokeInvite`, `getGroupRole`). `stubRemote` no los implementa;
  el motor devuelve "Las invitaciones requieren Supabase configurado".

### 17.4 RLS (`0007`, `0008`)

`drop policy if exists` sobre las 15 policies de `0002` + policies nuevas, todas
`to authenticated` (nunca `anon`):

| tabla | SELECT | INSERT (check) | UPDATE (using/check) | DELETE |
| --- | --- | --- | --- | --- |
| `groups` | `is_group_member(id) or created_by = auth.uid()` | `auth.uid() is not null` | `is_group_member(id)` | — |
| `group_members` | `is_group_member` | `is_group_owner` | `is_group_owner` | `is_group_owner or user_id = auth.uid()` |
| `group_invites` | `is_group_member` | `is_group_member and created_by = auth.uid()` | `is_group_owner or created_by = auth.uid()` | — |
| `participants` / `expenses` / `payments` | `is_group_member(group_id)` | idem | idem | — |
| `expense_participants` | `can_access_expense(expense_id)` | idem | idem | — |

- El `or created_by = auth.uid()` en `groups` SELECT (`0008`) es para que
  `INSERT … RETURNING` en `groups` no falle: la re-lectura de la fila recién
  creada corre la policy de SELECT **antes** de que el trigger AFTER
  (`groups_add_owner`) cree la membresía. `created_by` lo fija y **congela** un
  trigger BEFORE, así que no es falsificable y un tercero sigue sin poder ver el
  grupo con sólo el UUID.

- `can_access_expense` (`SECURITY DEFINER`) resuelve el grupo vía el `expense`
  padre (la tabla no tiene `group_id`).
- Sin policy de DELETE en las 5 tablas de datos: todo es soft-delete
  (`deleted_at`), como en `0002`. `group_members` sí tiene DELETE (salir del
  grupo / el owner quita a alguien).
- El soft-delete de un grupo (UPDATE de `deleted_at`) lo puede hacer cualquier
  miembro (es reversible por LWW, igual que editar el contenido); endurecerlo a
  "sólo owner" es cambiar un `WITH CHECK`. Lo administrativo sensible —gestionar
  la membresía y los roles— **sí** es sólo del owner.
- `0003` (`sync_revision`) y `0004` (integridad cross-group) siguen intactos y
  componen: sus triggers se evalúan igual bajo las nuevas policies.

### 17.5 Realtime bajo RLS

`postgres_changes` aplica la policy de SELECT por suscriptor una vez que el
socket va autenticado (`realtime.setAuth`). La publicación de `0002` sigue siendo
necesaria; `expense_participants` sigue reconciliándose por pull.

### 17.6 Offline-first y rechazos por acceso

- IndexedDB sigue siendo la fuente de la UI; los repos escriben local primero;
  `syncNow` corta en `!online`. La sesión cacheada en `localStorage` permite
  abrir grupos ya sincronizados sin red.
- Si el servidor rechaza un push por RLS (`42501`) o JWT inválido (`PGRST301`),
  `supabaseRemote` lo mapea a un mensaje claro (`accessError.ts`); el motor
  emite `access_error` y el `SyncBadge` muestra "Sin acceso al grupo". El item
  **no se borra** (sólo `purgeSynced` elimina, y sólo lo `synced`): agota a los
  `MAX_ATTEMPTS` y queda para revisión del usuario. Un grupo ausente del pull
  **no** se tombstonea local (`applyRemoteChanges` sólo aplica lo que recibe).

### 17.7 Transición de datos existentes

Las migraciones **no inventan propietarios**. Los grupos creados antes de `0007`
(sin `created_by` ni `group_members`) quedan invisibles al aplicarla. El paso
manual de "claim" (un `insert … select from groups where not exists …`) está
documentado al pie de `0007_rls_auth.sql`. En el proyecto real actual son datos
de prueba desechables (se vacía la base antes de aplicar).

### 17.8 Tests de RLS

`tests/security/rls.test.ts` levanta un Postgres real en proceso
(`@electric-sql/pglite`), stubea `auth.uid()` con un GUC (`request.jwt.claim.sub`)
y aplica las 7 migraciones. Cada escenario corre con `set local role
authenticated` + el sub del usuario, así RLS se aplica de verdad. Cubre: miembro
lee / ajeno no / UUID no alcanza / ajeno no edita ni inserta movimientos / ajeno
no toca `group_members` / invitación válida–revocada–vencida / doble canje
idempotente / `owner` automático / `anon` no ve nada / no quedan policies `to
anon`. `auth.uid()` es un stub: no se ejercita parseo real de JWT ni la entrega
de Realtime (verificación manual).

---

## Decisiones de stack

| Área             | Elección                     | Motivo                                            |
| ---------------- | ---------------------------- | ------------------------------------------------ |
| Framework        | Next.js 15 (App Router), 15.5.x | Pedido en el brief; se mantiene en la rama 15 (16 es major). |
| Lenguaje         | TypeScript estricto          | `noUncheckedIndexedAccess` activado.             |
| Estilos          | Tailwind CSS 3               | Pedido en el brief; Tailwind 4 es un rewrite mayor. |
| DB local         | Dexie sobre IndexedDB (v2)   | Abstracción mantenible; migraciones aditivas.    |
| DB remota        | Supabase / Postgres          | Pedido en el brief.                              |
| Tests unit       | Vitest 4 + fake-indexeddb    | Rápido; testea repos/sync sin navegador. v4 cierra vulns dev. |
| Tests RLS        | `@electric-sql/pglite` (dev) | Postgres real en proceso; RLS de verdad sin Docker (§17.8). |
| Tests E2E        | Playwright (chromium)        | Flujo real y offline, sin backend.              |
| Auth             | Supabase Anonymous Sign-In   | Acceso seguro por RLS sin pedir email/contraseña (§17). |
| CI               | GitHub Actions               | lint+typecheck+test+build+e2e, sin credenciales. |
| PWA              | Manifest + SW a mano         | Sección 33: evitar dependencias innecesarias.    |
| Iconos PWA       | PNG generados con `scripts/gen-icons.mjs` | Sin tooling de imágenes; encoder PNG a mano (zlib). |
| Estado UI ↔ datos | `dexie-react-hooks`         | `useLiveQuery` mantiene la UI viva desde IndexedDB. |
| Sync remoto      | `@supabase/supabase-js` (carga diferida) | Pedido en el brief; sólo se baja si hay credenciales. |
| postcss          | `overrides` a `^8.5.26`      | Next 15 embebe un postcss vulnerable; el override lo sube sin salir de la rama 15. |
