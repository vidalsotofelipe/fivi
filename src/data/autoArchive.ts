/**
 * Archivado automático de grupos.
 *
 * Un grupo activo se archiva solo únicamente cuando se cumplen las TRES:
 *   1. no tiene actividad reciente (último movimiento / toque > `ARCHIVE_AFTER_DAYS`),
 *   2. todos los participantes están al día (ningún balance ≠ 0),
 *   3. no tiene operaciones pendientes de sincronización.
 * Nunca se borra: sale de la lista principal a "Archivados" y se puede restaurar.
 * La comprobación corre en el cliente al abrir la app.
 */
import { FiviDatabase, db as defaultDb } from "./db";
import { isLive } from "./repositories/base";
import { archiveGroup } from "./repositories/groupRepo";
import { getGroupSummary, groupIdsWithPendingSync } from "./queries";

/** Días de inactividad tras los cuales un grupo se archiva automáticamente. */
export const ARCHIVE_AFTER_DAYS = 30;

const DAY_MS = 86_400_000;

/**
 * Archiva los grupos activos sin actividad reciente **y** sin deudas pendientes
 * **y** sin cambios sin sincronizar. Idempotente. Devuelve los ids archivados.
 */
export async function autoArchiveStaleGroups(
  database: FiviDatabase = defaultDb,
  now: number = Date.now(),
): Promise<string[]> {
  const cutoff = now - ARCHIVE_AFTER_DAYS * DAY_MS;
  const groups = (await database.groups.toArray()).filter(
    (g) => isLive(g) && g.archived_at === null,
  );
  const pendingSync = await groupIdsWithPendingSync(database);

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

    const stale = times.length > 0 && Math.max(...times) < cutoff;
    if (!stale) continue;

    // No archivar si hay cambios sin sincronizar de este grupo.
    if (pendingSync.has(g.id)) continue;

    // No archivar si todavía hay deudas pendientes entre los participantes.
    const summary = await getGroupSummary(g.id, database);
    const allSettled = summary.balances.every((b) => b.balance_minor === 0);
    if (!allSettled) continue;

    await archiveGroup(g.id, database);
    archived.push(g.id);
  }
  return archived;
}
