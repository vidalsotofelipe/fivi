/**
 * Acceso a la cola de sincronización `sync_queue` (sección 18).
 *
 * Estados: pending -> syncing -> synced | error.
 *
 * Reintentos con **exponential backoff + jitter**:
 *  - al fallar un item se incrementa `attempts` y se fija `next_attempt_at`
 *    (ISO) con la próxima ventana de reintento;
 *  - `getPendingItems` sólo devuelve un item en `error` cuando `next_attempt_at`
 *    ya pasó y todavía no agotó `MAX_ATTEMPTS`;
 *  - un item que agotó los reintentos (`attempts >= MAX_ATTEMPTS`) queda como
 *    error "agotado": no se reintenta solo y se cuenta aparte (`exhausted`).
 *  - un item fallido NO bloquea a los demás: el resto sigue procesándose.
 */

import { FiviDatabase, db as defaultDb } from "@/data/db";
import type { SyncQueueItem, SyncStatus } from "./types";

/** Máximo de reintentos antes de dar un item por "agotado". Configurable. */
export const MAX_ATTEMPTS = 5;
/** Demora base del backoff (ms). */
export const BASE_DELAY_MS = 2_000;
/** Techo del backoff (ms) — 5 minutos. */
export const MAX_DELAY_MS = 5 * 60_000;

/**
 * Demora (ms) antes del reintento nº `attempts` (1-indexado).
 * "Equal jitter": mitad fija + mitad aleatoria sobre `base * 2^(attempts-1)`,
 * con techo `MAX_DELAY_MS`. `random` es inyectable para tests deterministas.
 */
export function backoffDelayMs(
  attempts: number,
  random: () => number = Math.random,
): number {
  const exp = Math.min(
    MAX_DELAY_MS,
    BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1),
  );
  const half = exp / 2;
  return Math.round(half + random() * half);
}

function nextAttemptAt(
  attempts: number,
  now: number,
  random?: () => number,
): string {
  return new Date(now + backoffDelayMs(attempts, random)).toISOString();
}

export interface PendingOpts {
  /** Momento de referencia (ms epoch). Default: `Date.now()`. */
  now?: number;
  maxAttempts?: number;
  /**
   * Ignora la ventana de backoff (`next_attempt_at`) y devuelve todos los
   * `error` que no agotaron reintentos. Lo usa el motor cuando el usuario
   * fuerza un sync (volvió la conexión, abrió un enlace).
   */
  ignoreBackoff?: boolean;
}

/**
 * Items listos para enviar: todos los `pending`, más los `error` cuyo
 * `next_attempt_at` ya venció (o siempre, si `ignoreBackoff`) y que no agotaron
 * reintentos.
 */
export async function getPendingItems(
  database: FiviDatabase = defaultDb,
  opts: PendingOpts = {},
): Promise<SyncQueueItem[]> {
  const now = opts.now ?? Date.now();
  const maxAttempts = opts.maxAttempts ?? MAX_ATTEMPTS;
  const nowIsoStr = new Date(now).toISOString();

  const all = await database.sync_queue.toArray();
  return all
    .filter((i) => {
      if (i.sync_status === "pending") return true;
      if (i.sync_status !== "error") return false;
      if (i.attempts >= maxAttempts) return false;
      if (opts.ignoreBackoff) return true;
      const na = i.next_attempt_at ?? null;
      return na === null || na <= nowIsoStr;
    })
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/**
 * Devuelve a `pending` los items que quedaron en `syncing` de una corrida
 * anterior interrumpida (la app se cerró o navegó mientras sincronizaba).
 * Idempotente y seguro: `syncNow` no corre en paralelo consigo mismo. El upsert
 * remoto es idempotente, así que reintentar no duplica efectos.
 */
export async function requeueStaleSyncing(
  database: FiviDatabase = defaultDb,
): Promise<number> {
  const stale = await database.sync_queue
    .where("sync_status")
    .equals("syncing")
    .toArray();
  if (stale.length === 0) return 0;
  await database.transaction("rw", database.sync_queue, async () => {
    for (const item of stale) {
      await database.sync_queue.put({
        ...item,
        sync_status: "pending",
        next_attempt_at: null,
      });
    }
  });
  return stale.length;
}

export interface QueueStats {
  /** pending + error que todavía puede reintentar. */
  pending: number;
  /** error que agotó `MAX_ATTEMPTS`. */
  exhausted: number;
  /** en vuelo. */
  syncing: number;
  /** ya sincronizados, a la espera de purga. */
  synced: number;
}

export async function getQueueStats(
  database: FiviDatabase = defaultDb,
): Promise<QueueStats> {
  const all = await database.sync_queue.toArray();
  let pending = 0;
  let exhausted = 0;
  let syncing = 0;
  let synced = 0;
  for (const i of all) {
    if (i.sync_status === "synced") synced++;
    else if (i.sync_status === "syncing") syncing++;
    else if (i.sync_status === "error" && i.attempts >= MAX_ATTEMPTS) exhausted++;
    else pending++;
  }
  return { pending, exhausted, syncing, synced };
}

/** Items sin sincronizar que todavía pueden avanzar (excluye agotados). */
export async function countPending(
  database: FiviDatabase = defaultDb,
): Promise<number> {
  return (await getQueueStats(database)).pending;
}

/** Items que agotaron los reintentos y necesitan atención. */
export async function countExhausted(
  database: FiviDatabase = defaultDb,
): Promise<number> {
  return (await getQueueStats(database)).exhausted;
}

export interface MarkOpts {
  error?: string | null;
  /** Momento de referencia (ms epoch) para calcular el backoff. */
  now?: number;
  /** Inyectable para tests deterministas del jitter. */
  random?: () => number;
}

/**
 * Cambia el estado de varios items de la cola.
 *  - `error`: `attempts++`, guarda `error`, y fija `next_attempt_at` con el
 *    backoff (salvo que ya haya agotado `MAX_ATTEMPTS`).
 *  - `synced` / `pending`: limpia `error` y `next_attempt_at`.
 *  - `syncing`: sólo marca el estado.
 */
export async function markStatus(
  ids: string[],
  status: SyncStatus,
  database: FiviDatabase = defaultDb,
  opts: MarkOpts = {},
): Promise<void> {
  if (ids.length === 0) return;
  const now = opts.now ?? Date.now();
  const stamp = new Date(now).toISOString();

  await database.transaction("rw", database.sync_queue, async () => {
    for (const id of ids) {
      const item = await database.sync_queue.get(id);
      if (!item) continue;

      let next: SyncQueueItem;
      if (status === "error") {
        const attempts = item.attempts + 1;
        next = {
          ...item,
          sync_status: "error",
          attempts,
          last_attempt_at: stamp,
          error: opts.error ?? item.error ?? "error de sincronización",
          next_attempt_at:
            attempts < MAX_ATTEMPTS
              ? nextAttemptAt(attempts, now, opts.random)
              : null,
        };
      } else if (status === "syncing") {
        next = { ...item, sync_status: "syncing", last_attempt_at: stamp };
      } else {
        // synced | pending
        next = {
          ...item,
          sync_status: status,
          last_attempt_at: stamp,
          error: null,
          next_attempt_at: null,
        };
      }
      await database.sync_queue.put(next);
    }
  });
}

/** Elimina de la cola los items ya sincronizados (mantenimiento). */
export async function purgeSynced(
  database: FiviDatabase = defaultDb,
): Promise<number> {
  const all = await database.sync_queue.toArray();
  const doneIds = all
    .filter((i) => i.sync_status === "synced")
    .map((i) => i.id);
  await database.sync_queue.bulkDelete(doneIds);
  return doneIds.length;
}
