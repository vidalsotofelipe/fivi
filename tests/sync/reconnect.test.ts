import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { FiviDatabase } from "@/data/db";
import { newId } from "@/data/ids";
import * as groupRepo from "@/data/repositories/groupRepo";
import * as participantRepo from "@/data/repositories/participantRepo";
import { SyncEngine } from "@/sync/SyncEngine";
import { markStatus, purgeSynced } from "@/sync/queue";
import type { RemotePort } from "@/sync/RemotePort";
import type { SyncQueueItem } from "@/sync/types";

let db: FiviDatabase;

beforeEach(async () => {
  db = new FiviDatabase(`fivi-reconnect-${newId()}`);
  await db.open();
});

/** Remoto de prueba que registra cada tanda de push y acepta todo. */
function recordingRemote(): RemotePort & { pushes: SyncQueueItem[][] } {
  const pushes: SyncQueueItem[][] = [];
  return {
    pushes,
    async push(items) {
      pushes.push(items);
      return { accepted_ids: items.map((i) => i.id), rejected: [] };
    },
    async pull() {
      return [];
    },
  };
}

describe("modo cloud: no se hace push contra el stub inicial", () => {
  it("syncNow no toca la cola mientras el remoto real no está listo", async () => {
    await groupRepo.createGroup({ name: "G", currency_code: "ARS" }, db);
    const remote = recordingRemote();
    const engine = new SyncEngine({
      remote,
      database: db,
      pollIntervalMs: 0,
      cloudMode: true,
    });

    await engine.syncNow(true);

    expect(remote.pushes).toHaveLength(0);
    const q = await db.sync_queue.toArray();
    expect(q).toHaveLength(1);
    expect(q[0]!.sync_status).toBe("pending");
    expect(engine.getState().remote_ready).toBe(false);
  });

  it("al conectar el remoto real (setRemote) recién ahí se envía la cola", async () => {
    await groupRepo.createGroup({ name: "G", currency_code: "ARS" }, db);
    const stub = recordingRemote();
    const engine = new SyncEngine({
      remote: stub,
      database: db,
      pollIntervalMs: 0,
      cloudMode: true,
    });
    await engine.syncNow(true);
    expect(stub.pushes).toHaveLength(0);

    const real = recordingRemote();
    await engine.setRemote(real);

    expect(real.pushes.length).toBeGreaterThan(0);
    expect(real.pushes[0]!.some((i) => i.entity_type === "group")).toBe(true);
    expect(engine.getState().remote_ready).toBe(true);
  });
});

describe("recuperación de datos huérfanos en local", () => {
  it("re-encola un grupo local que el pull completo no devolvió", async () => {
    const g = await groupRepo.createGroup(
      { name: "Huérfano", currency_code: "ARS" },
      db,
    );
    await participantRepo.addParticipant(g.id, "Ana", db);

    // Simula que el stub inicial se "comió" las altas: quedan en local, sin
    // op en la cola y sin llegar nunca al servidor.
    const items = await db.sync_queue.toArray();
    await markStatus(
      items.map((i) => i.id),
      "synced",
      db,
    );
    await purgeSynced(db);
    expect(await db.sync_queue.count()).toBe(0);

    // El remoto real conecta y su pull no devuelve nada (el server no tiene el
    // grupo / el usuario no es miembro).
    const real = recordingRemote();
    const engine = new SyncEngine({
      remote: real,
      database: db,
      pollIntervalMs: 0,
      cloudMode: true,
    });
    await engine.setRemote(real);

    // Se re-encoló y se envió el alta del grupo + su participante.
    const sent = real.pushes.flat();
    expect(sent.some((i) => i.entity_type === "group" && i.entity_id === g.id)).toBe(
      true,
    );
    expect(sent.some((i) => i.entity_type === "participant")).toBe(true);
  });

  it("no re-encola nada si el grupo local sí vino en el pull", async () => {
    const g = await groupRepo.createGroup(
      { name: "OK", currency_code: "ARS" },
      db,
    );
    const items = await db.sync_queue.toArray();
    await markStatus(items.map((i) => i.id), "synced", db);
    await purgeSynced(db);

    const real: RemotePort & { pushes: SyncQueueItem[][] } = {
      pushes: [],
      async push(i) {
        (this as { pushes: SyncQueueItem[][] }).pushes.push(i);
        return { accepted_ids: i.map((x) => x.id), rejected: [] };
      },
      async pull() {
        return [
          {
            entity_type: "group",
            entity_id: g.id,
            payload: {},
            updated_at: g.updated_at,
            version: g.version,
            deleted_at: null,
          },
        ];
      },
    };
    const engine = new SyncEngine({
      remote: real,
      database: db,
      pollIntervalMs: 0,
      cloudMode: true,
    });
    await engine.setRemote(real);

    expect(real.pushes.flat()).toHaveLength(0);
    expect(await db.sync_queue.count()).toBe(0);
  });
});
