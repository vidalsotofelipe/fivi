/**
 * Aplica cambios remotos en la base local (secciones 16, 22, 32).
 *
 * Estrategia de resolución de conflictos del MVP: **last-write-wins por
 * `updated_at`**, con `version` como desempate. Nunca se sobrescribe algo local
 * más nuevo. Los borrados llegan como filas con `deleted_at` (tombstones) y se
 * aplican igual que cualquier otro cambio.
 *
 * Importante: escribe directo en las tablas de entidades, **sin** pasar por los
 * repositorios, para no volver a encolar en `sync_queue` lo que ya vino del
 * servidor.
 */

import type { Table } from "dexie";
import type { SyncableRecord } from "@/domain/types";
import { FiviDatabase, db as defaultDb } from "@/data/db";
import { TABLE_BY_ENTITY } from "./entities";
import type { RemoteChange } from "./types";

export interface ApplyResult {
  applied: number;
  skipped: number;
}

/** True si `incoming` debe reemplazar a `local` (o si no hay local). */
export function shouldApply(
  incoming: Pick<SyncableRecord, "updated_at" | "version">,
  local: Pick<SyncableRecord, "updated_at" | "version"> | undefined,
): boolean {
  if (!local) return true;
  if (incoming.updated_at > local.updated_at) return true;
  if (incoming.updated_at < local.updated_at) return false;
  return incoming.version > local.version;
}

export async function applyRemoteChanges(
  changes: RemoteChange[],
  database: FiviDatabase = defaultDb,
): Promise<ApplyResult> {
  if (changes.length === 0) return { applied: 0, skipped: 0 };

  const tableNames = [
    ...new Set(changes.map((c) => TABLE_BY_ENTITY[c.entity_type])),
  ];
  const tables = tableNames.map(
    (name) => database.table(name) as Table<SyncableRecord, string>,
  );

  let applied = 0;
  let skipped = 0;

  await database.transaction("rw", tables, async () => {
    for (const change of changes) {
      const table = database.table(
        TABLE_BY_ENTITY[change.entity_type],
      ) as Table<SyncableRecord, string>;
      const incoming = change.payload as SyncableRecord;
      const local = await table.get(change.entity_id);
      if (shouldApply(incoming, local)) {
        await table.put(incoming);
        applied++;
      } else {
        skipped++;
      }
    }
  });

  return { applied, skipped };
}
