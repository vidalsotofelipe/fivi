/**
 * Implementación stub de `RemotePort` (sin red).
 *
 * Sirve para que el resto de la app (repos, motor de sync, UI) funcione end to
 * end en local mientras no está conectado Supabase. Acepta todo lo que se le
 * envía y no devuelve cambios remotos.
 *
 * Se puede pasar `{ latencyMs }` para simular demora y `{ failEntityTypes }`
 * para simular rechazos en tests.
 */

import type { RemotePort } from "./RemotePort";
import type { PushResult, RemoteChange, SyncQueueItem } from "./types";

export interface StubRemoteOptions {
  latencyMs?: number;
  failEntityTypes?: string[];
}

export function createStubRemote(options: StubRemoteOptions = {}): RemotePort {
  const { latencyMs = 0, failEntityTypes = [] } = options;
  const wait = () =>
    latencyMs > 0
      ? new Promise((r) => setTimeout(r, latencyMs))
      : Promise.resolve();

  return {
    async push(items: SyncQueueItem[]): Promise<PushResult> {
      await wait();
      const accepted_ids: string[] = [];
      const rejected: { id: string; error: string }[] = [];
      for (const item of items) {
        if (failEntityTypes.includes(item.entity_type)) {
          rejected.push({ id: item.id, error: "stub: entity_type rechazado" });
        } else {
          accepted_ids.push(item.id);
        }
      }
      return { accepted_ids, rejected };
    },

    async pull(): Promise<RemoteChange[]> {
      // El stub no tiene servidor: no hay cambios remotos que traer.
      await wait();
      return [];
    },

    // `createInvite` / `redeemInvite` / `listInvites` / `revokeInvite` /
    // `getGroupRole` quedan sin implementar a propósito: sin Supabase no hay
    // usuarios ni invitaciones. El motor detecta que faltan y la UI muestra
    // "las invitaciones requieren Supabase configurado".
  };
}
