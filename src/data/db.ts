/**
 * Base de datos local con Dexie sobre IndexedDB (secciones 13, 14 y 24).
 *
 * IndexedDB es el almacenamiento principal: la UI lee siempre de acá y la
 * aplicación responde sin esperar al servidor. `localStorage` no se usa como
 * base de datos.
 *
 * Todos los stores de entidades comparten los campos de `SyncableRecord`
 * (id, created_at, updated_at, version, deleted_at). El store `sync_queue`
 * guarda las operaciones pendientes de enviar al servidor.
 */

import Dexie, { type Table } from "dexie";
import type {
  Group,
  Participant,
  Expense,
  ExpenseParticipant,
  Payment,
} from "@/domain/types";
import type { SyncQueueItem } from "@/sync/types";

/** Par clave/valor para configuración local y metadatos de sync. */
export interface SettingRow {
  key: string;
  value: unknown;
}

export class FiviDatabase extends Dexie {
  groups!: Table<Group, string>;
  participants!: Table<Participant, string>;
  expenses!: Table<Expense, string>;
  expense_participants!: Table<ExpenseParticipant, string>;
  payments!: Table<Payment, string>;
  settings!: Table<SettingRow, string>;
  sync_queue!: Table<SyncQueueItem, string>;

  constructor(name = "fivi") {
    super(name);

    // v1: esquema inicial.
    this.version(1).stores({
      // Sólo se indexan las columnas por las que se consulta.
      groups: "id, updated_at, deleted_at",
      participants: "id, group_id, updated_at, deleted_at",
      expenses: "id, group_id, paid_by, expense_date, updated_at, deleted_at",
      expense_participants:
        "id, expense_id, participant_id, updated_at, deleted_at",
      payments:
        "id, group_id, from_participant, to_participant, payment_date, updated_at, deleted_at",
      settings: "key",
      sync_queue: "id, sync_status, entity_type, entity_id, created_at",
    });

    // v2: retry con backoff. Agrega `next_attempt_at` al índice de `sync_queue`
    // (migración aditiva: no toca las otras tablas ni borra nada). Las filas
    // existentes se rellenan con `next_attempt_at = null` (elegibles ya).
    this.version(2)
      .stores({
        sync_queue:
          "id, sync_status, entity_type, entity_id, created_at, next_attempt_at",
      })
      .upgrade(async (tx) => {
        await tx
          .table<SyncQueueItem, string>("sync_queue")
          .toCollection()
          .modify((item) => {
            if (item.next_attempt_at === undefined) {
              item.next_attempt_at = null;
            }
          });
      });

    // v3: grupos archivables. Agrega `archived_at` al índice de `groups`
    // (aditiva). Las filas existentes quedan con `archived_at = null` (activas).
    this.version(3)
      .stores({
        groups: "id, updated_at, deleted_at, archived_at",
      })
      .upgrade(async (tx) => {
        await tx
          .table<Group, string>("groups")
          .toCollection()
          .modify((g) => {
            if (g.archived_at === undefined) g.archived_at = null;
          });
      });
  }
}

/**
 * Instancia única para la app. En tests se crea una base fresca por caso con
 * `new FiviDatabase(nombreÚnico)` para aislar el estado.
 */
export const db = new FiviDatabase();
