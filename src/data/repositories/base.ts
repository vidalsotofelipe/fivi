/**
 * Helpers compartidos por los repositorios locales.
 *
 * Cada mutación:
 *  1. escribe la entidad en su store de Dexie (con version++ y updated_at),
 *  2. encola una operación en `sync_queue` como `pending`,
 * todo dentro de una misma transacción para que no puedan quedar a medias.
 *
 * Los repos aceptan una instancia de base opcional para poder testear con una
 * base fresca por caso.
 */

import type { Table } from "dexie";
import type { SyncableRecord } from "@/domain/types";
import type {
  SyncEntityType,
  SyncOperation,
  SyncQueueItem,
} from "@/sync/types";
import { FiviDatabase, db as defaultDb } from "../db";
import { newId, nowIso } from "../ids";

export type NewRecordInput<T extends SyncableRecord> = Omit<
  T,
  keyof SyncableRecord
> & { id?: string };

function buildQueueItem(
  operation: SyncOperation,
  entity_type: SyncEntityType,
  entity_id: string,
  payload: unknown,
): SyncQueueItem {
  return {
    id: newId(),
    operation,
    entity_type,
    entity_id,
    payload,
    created_at: nowIso(),
    attempts: 0,
    last_attempt_at: null,
    next_attempt_at: null,
    sync_status: "pending",
    error: null,
  };
}

/** Crea una entidad sincronizable y encola su CREATE. */
export async function createRecord<T extends SyncableRecord>(
  table: Table<T, string>,
  entityType: SyncEntityType,
  input: NewRecordInput<T>,
  database: FiviDatabase = defaultDb,
): Promise<T> {
  const ts = nowIso();
  const record = {
    ...input,
    id: input.id ?? newId(),
    created_at: ts,
    updated_at: ts,
    version: 1,
    deleted_at: null,
  } as unknown as T;

  await database.transaction("rw", table, database.sync_queue, async () => {
    await table.add(record);
    await database.sync_queue.add(
      buildQueueItem("CREATE", entityType, record.id, record),
    );
  });
  return record;
}

/** Aplica cambios parciales a una entidad y encola su UPDATE. */
export async function updateRecord<T extends SyncableRecord>(
  table: Table<T, string>,
  entityType: SyncEntityType,
  id: string,
  patch: Partial<Omit<T, keyof SyncableRecord>>,
  database: FiviDatabase = defaultDb,
): Promise<T> {
  return database.transaction("rw", table, database.sync_queue, async () => {
    const current = await table.get(id);
    if (!current) throw new Error(`No existe ${entityType} con id ${id}`);
    const updated = {
      ...current,
      ...patch,
      updated_at: nowIso(),
      version: current.version + 1,
    } as T;
    await table.put(updated);
    await database.sync_queue.add(
      buildQueueItem("UPDATE", entityType, id, updated),
    );
    return updated;
  });
}

/**
 * Soft delete: marca `deleted_at` y encola un DELETE (tombstone).
 * No borra la fila de forma definitiva (sección 23).
 */
export async function softDeleteRecord<T extends SyncableRecord>(
  table: Table<T, string>,
  entityType: SyncEntityType,
  id: string,
  database: FiviDatabase = defaultDb,
): Promise<T> {
  return database.transaction("rw", table, database.sync_queue, async () => {
    const current = await table.get(id);
    if (!current) throw new Error(`No existe ${entityType} con id ${id}`);
    const deleted = {
      ...current,
      deleted_at: nowIso(),
      updated_at: nowIso(),
      version: current.version + 1,
    } as T;
    await table.put(deleted);
    await database.sync_queue.add(
      buildQueueItem("DELETE", entityType, id, deleted),
    );
    return deleted;
  });
}

/** Filtra tombstones. */
export function isLive<T extends SyncableRecord>(record: T): boolean {
  return record.deleted_at === null;
}
