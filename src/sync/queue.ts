/**
 * Acceso a la cola de sincronización `sync_queue` (sección 18).
 *
 * Estados: pending -> syncing -> synced | error. En error se incrementa
 * `attempts` para poder aplicar backoff y reintentar más tarde.
 */

import { FiviDatabase, db as defaultDb } from "@/data/db";
import { nowIso } from "@/data/ids";
import type { SyncQueueItem, SyncStatus } from "./types";

/** Items que están para enviar: pending o error con reintentos disponibles. */
export async function getPendingItems(
  database: FiviDatabase = defaultDb,
  maxAttempts = 5,
): Promise<SyncQueueItem[]> {
  const all = await database.sync_queue.toArray();
  return all
    .filter(
      (i) =>
        i.sync_status === "pending" ||
        (i.sync_status === "error" && i.attempts < maxAttempts),
    )
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/**
 * Devuelve a `pending` los items que quedaron en `syncing` de una corrida
 * anterior interrumpida (p. ej. la app se cerró o navegó mientras sincronizaba).
 * Seguro de llamar al inicio de cada corrida: `syncNow` no corre en paralelo
 * consigo mismo, así que cualquier `syncing` presente ya es viejo.
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
      await database.sync_queue.put({ ...item, sync_status: "pending" });
    }
  });
  return stale.length;
}

export async function countPending(
  database: FiviDatabase = defaultDb,
): Promise<number> {
  const all = await database.sync_queue.toArray();
  return all.filter((i) => i.sync_status !== "synced").length;
}

export async function markStatus(
  ids: string[],
  status: SyncStatus,
  database: FiviDatabase = defaultDb,
  error: string | null = null,
): Promise<void> {
  if (ids.length === 0) return;
  await database.transaction("rw", database.sync_queue, async () => {
    for (const id of ids) {
      const item = await database.sync_queue.get(id);
      if (!item) continue;
      const next: SyncQueueItem = {
        ...item,
        sync_status: status,
        last_attempt_at: nowIso(),
        error,
        attempts:
          status === "error" || status === "syncing"
            ? item.attempts + (status === "error" ? 1 : 0)
            : item.attempts,
      };
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
