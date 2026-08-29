/**
 * Puerto del repositorio remoto (sección 34: separación de responsabilidades).
 *
 * El motor de sincronización habla con el servidor SÓLO a través de esta
 * interfaz. Hay dos implementaciones:
 *  - `stubRemote`: sin red, para trabajar 100% local.
 *  - `supabaseRemote`: Supabase (Postgres + Realtime).
 * Se elige una u otra según haya credenciales configuradas, sin tocar el resto
 * de la app.
 */

import type { PushResult, RemoteChange, SyncQueueItem } from "./types";

export interface RemoteSubscription {
  unsubscribe(): void;
}

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

  /**
   * (Opcional) Se suscribe a cambios en vivo de los grupos indicados
   * (sección 32). Cada lote de cambios se entrega por `onChange`. Devuelve un
   * handle para cancelar la suscripción.
   */
  subscribe?(params: {
    group_ids: string[];
    onChange: (changes: RemoteChange[]) => void;
  }): RemoteSubscription;
}
