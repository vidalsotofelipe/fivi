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
  /**
   * Momento (ISO) a partir del cual se puede reintentar un item en `error`.
   * Lo fija el backoff exponencial + jitter. `null`/ausente → elegible ya.
   * Filas creadas antes de la v2 de la base no lo tienen: se trata como `null`.
   */
  next_attempt_at?: string | null;
  sync_status: SyncStatus;
  error: string | null;
}

/** Estado agregado que la UI muestra de forma discreta (sección 21). */
export interface SyncState {
  online: boolean;
  syncing: boolean;
  /** Items de la cola sin sincronizar (pending + error que todavía puede reintentar). */
  pending_count: number;
  /** Items que agotaron los reintentos y necesitan atención. */
  exhausted_count: number;
  last_synced_at: string | null;
  last_error: string | null;
  /**
   * Mensaje cuando el servidor rechaza cambios por falta de acceso al grupo
   * (RLS / sesión inválida). El dato local se conserva; la UI lo informa.
   * `null` mientras no haya un rechazo de ese tipo pendiente.
   */
  access_error: string | null;
  /**
   * `false` mientras el remoto real (Supabase) todavía se está cargando /
   * autenticando. La ruta `/join/<token>` espera a que sea `true` antes de
   * intentar canjear. En modo local es `true` desde el arranque.
   */
  remote_ready: boolean;
  /**
   * Grupos pedidos por enlace que todavía no terminaron su primer pull desde el
   * servidor. La UI muestra "cargando" en vez de "no existe" mientras estén acá.
   */
  hydrating_group_ids: string[];
}

/** Datos de una invitación para gestionarla desde la configuración del grupo. */
export interface InviteInfo {
  id: string;
  created_at: string;
  created_by: string;
  expires_at: string | null;
  revoked_at: string | null;
  uses: number;
  max_uses: number | null;
}

/** Cambio remoto recibido durante un pull o por Realtime. */
export interface RemoteChange {
  entity_type: SyncEntityType;
  entity_id: string;
  payload: unknown;
  updated_at: string;
  version: number;
  deleted_at: string | null;
  /**
   * Cursor server-owned (columna `sync_revision`, secuencia de Postgres). El
   * motor avanza su cursor al máximo `sync_revision` recibido. Ausente en el
   * `stubRemote` (sin servidor) y en payloads viejos.
   */
  sync_revision?: number;
}

export interface PushResult {
  /** ids de SyncQueueItem aceptados por el servidor. */
  accepted_ids: string[];
  /** ids que fallaron, con el motivo. */
  rejected: { id: string; error: string }[];
}
