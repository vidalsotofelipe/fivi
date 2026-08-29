/**
 * Puerto del repositorio remoto (sección 34: separación de responsabilidades).
 *
 * El motor de sincronización habla con el servidor SÓLO a través de esta
 * interfaz. Hoy existe una implementación stub (`stubRemote`) sin red. Más
 * adelante habrá una implementación contra Supabase que respete el mismo
 * contrato, sin tocar el resto de la app.
 */

import type { PushResult, RemoteChange, SyncQueueItem } from "./types";

export interface RemotePort {
  /** Envía operaciones locales pendientes al servidor. */
  push(items: SyncQueueItem[]): Promise<PushResult>;

  /**
   * Trae los cambios del servidor posteriores a `since` (ISO datetime) para los
   * grupos indicados. `since === null` significa "todo".
   */
  pull(params: {
    group_ids: string[];
    since: string | null;
  }): Promise<RemoteChange[]>;
}
