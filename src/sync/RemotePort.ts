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

import type {
  InviteInfo,
  PushResult,
  RemoteChange,
  SyncQueueItem,
} from "./types";

export interface RemoteSubscription {
  unsubscribe(): void;
}

export type GroupRole = "owner" | "member";

export interface RemotePort {
  /** Envía operaciones locales pendientes al servidor. */
  push(items: SyncQueueItem[]): Promise<PushResult>;

  /**
   * Trae los cambios del servidor con `sync_revision > cursor` para los grupos
   * indicados, ordenados por `sync_revision` ascendente. `cursor === null`
   * significa "todo" (pull completo).
   *
   * `cursor` es un entero monotónico asignado por el servidor (no un timestamp
   * del cliente): así el pull incremental no depende de relojes.
   */
  pull(params: {
    group_ids: string[];
    cursor: number | null;
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

  // --- Invitaciones (Etapa 7). Sólo el remoto real las implementa; en modo
  //     local (stubRemote) quedan `undefined` y el motor devuelve un error claro.

  /** Crea una invitación: guarda el hash del token. Devuelve su id. */
  createInvite?(params: {
    group_id: string;
    /** `\x…` hex del SHA-256 del token (el token crudo nunca llega al servidor). */
    token_hash: string;
    expires_at: string | null;
    max_uses: number | null;
  }): Promise<{ id: string }>;

  /**
   * Canjea un token (crudo) contra la RPC del servidor: valida vigencia y
   * revocación, agrega al usuario actual a `group_members` y devuelve el grupo.
   */
  redeemInvite?(params: { token: string }): Promise<{ group_id: string }>;

  /** Invitaciones del grupo (para gestionarlas). */
  listInvites?(group_id: string): Promise<InviteInfo[]>;

  /** Revoca una invitación por id. */
  revokeInvite?(invite_id: string): Promise<void>;

  /** Rol del usuario actual en el grupo, o `null` si no es miembro. */
  getGroupRole?(group_id: string): Promise<GroupRole | null>;
}
