/**
 * Archivado automático de grupos por inactividad.
 *
 * Un grupo cuyo último movimiento (gasto o pago **registrado**, o la creación
 * del grupo si no hay ninguno) es más viejo que `ARCHIVE_AFTER_DAYS` se archiva
 * solo: sale de la lista principal a "Archivados", pero NO se borra y se puede
 * restaurar. La comprobación corre en el cliente al abrir la app.
 */
import { FiviDatabase, db as defaultDb } from "./db";
import { isLive } from "./repositories/base";
import { archiveGroup } from "./repositories/groupRepo";

/** Días de inactividad tras los cuales un grupo se archiva automáticamente. */
export const ARCHIVE_AFTER_DAYS = 30;

const DAY_MS = 86_400_000;

/**
 * Archiva los grupos activos sin actividad reciente. Idempotente (no toca los
 * ya archivados ni los borrados). Devuelve los ids archivados en esta pasada.
 */
export async function autoArchiveStaleGroups(
  database: FiviDatabase = defaultDb,
  now: number = Date.now(),
): Promise<string[]> {
  const cutoff = now - ARCHIVE_AFTER_DAYS * DAY_MS;
  const groups = (await database.groups.toArray()).filter(
    (g) => isLive(g) && g.archived_at === null,
  );

  const archived: string[] = [];
  for (const g of groups) {
    const [expenses, payments] = await Promise.all([
      database.expenses.where("group_id").equals(g.id).toArray(),
      database.payments.where("group_id").equals(g.id).toArray(),
    ]);
    const times = [
      new Date(g.created_at).getTime(),
      // `updated_at` del grupo: cuenta como actividad tocar sus datos o
      // restaurarlo (si no, un grupo viejo restaurado a mano se volvería a
      // archivar en la carga siguiente).
      new Date(g.updated_at).getTime(),
      ...expenses.filter(isLive).map((e) => new Date(e.created_at).getTime()),
      ...payments.filter(isLive).map((p) => new Date(p.created_at).getTime()),
    ].filter((t) => Number.isFinite(t));

    if (times.length > 0 && Math.max(...times) < cutoff) {
      await archiveGroup(g.id, database);
      archived.push(g.id);
    }
  }
  return archived;
}
