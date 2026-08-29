/**
 * Mapa entre los `entity_type` de la cola de sincronización y las tablas
 * (mismo nombre en Dexie local y en Postgres/Supabase).
 */

import type { SyncEntityType } from "./types";

export const TABLE_BY_ENTITY: Record<SyncEntityType, string> = {
  group: "groups",
  participant: "participants",
  expense: "expenses",
  expense_participant: "expense_participants",
  payment: "payments",
};

export const ENTITY_BY_TABLE: Record<string, SyncEntityType> = Object.fromEntries(
  Object.entries(TABLE_BY_ENTITY).map(([entity, table]) => [
    table,
    entity as SyncEntityType,
  ]),
) as Record<string, SyncEntityType>;

/** Tablas que se sincronizan, en orden de dependencia (padres primero). */
export const SYNC_TABLES = [
  "groups",
  "participants",
  "expenses",
  "expense_participants",
  "payments",
] as const;
