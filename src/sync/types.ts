/**
 * Tipos del subsistema de sincronización (secciones 16-18 y 21 del documento).
 */

export type SyncOperation = "CREATE" | "UPDATE" | "DELETE";

export type SyncEntityType =
  | "group"
  | "participant"
  | "expense"
  | "expense_participant"
  | "payment";

export type SyncStatus = "pending" | "syncing" | "synced" | "error";

/**
 * Fila de la cola de sincronización. Se crea una por cada mutación local y se
 * procesa cuando hay conexión. `payload` es el estado completo de la entidad
 * al momento de la operación.
 */
export interface SyncQueueItem {
  id: string;
  operation: SyncOperation;
  entity_type: SyncEntityType;
  entity_id: string;
  payload: unknown;
  created_at: string;
  attempts: number;
  last_attempt_at: string | null;
  sync_status: SyncStatus;
  error: string | null;
}

/** Estado agregado que la UI muestra de forma discreta (sección 21). */
export interface SyncState {
  online: boolean;
  syncing: boolean;
  pending_count: number;
  last_synced_at: string | null;
  last_error: string | null;
}

/** Cambio remoto recibido durante un pull. */
export interface RemoteChange {
  entity_type: SyncEntityType;
  entity_id: string;
  payload: unknown;
  updated_at: string;
  version: number;
  deleted_at: string | null;
}

export interface PushResult {
  /** ids de SyncQueueItem aceptados por el servidor. */
  accepted_ids: string[];
  /** ids que fallaron, con el motivo. */
  rejected: { id: string; error: string }[];
}
