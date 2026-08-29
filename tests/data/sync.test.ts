import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { FiviDatabase } from "@/data/db";
import { newId } from "@/data/ids";
import * as groupRepo from "@/data/repositories/groupRepo";
import {
  countPending,
  getPendingItems,
  markStatus,
  requeueStaleSyncing,
} from "@/sync/queue";
import { createStubRemote } from "@/sync/stubRemote";
import { SyncEngine } from "@/sync/SyncEngine";

let db: FiviDatabase;

beforeEach(async () => {
  db = new FiviDatabase(`fivi-sync-${newId()}`);
  await db.open();
});

describe("cola de sincronización", () => {
  it("una entidad creada offline queda pendiente", async () => {
    await groupRepo.createGroup({ name: "G", currency_code: "ARS" }, db);
    expect(await countPending(db)).toBe(1);
    const pending = await getPendingItems(db);
    expect(pending[0]?.sync_status).toBe("pending");
  });

  it("recupera items que quedaron en 'syncing' tras una interrupción", async () => {
    await groupRepo.createGroup({ name: "G", currency_code: "ARS" }, db);
    const [item] = await getPendingItems(db);
    await markStatus([item!.id], "syncing", db);
    // Sin recuperación, un item en 'syncing' no lo devuelve getPendingItems.
    expect(await getPendingItems(db)).toHaveLength(0);

    const recovered = await requeueStaleSyncing(db);
    expect(recovered).toBe(1);
    const pending = await getPendingItems(db);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.sync_status).toBe("pending");
  });
});

describe("SyncEngine con stubRemote", () => {
  it("procesa la cola y deja todo sincronizado", async () => {
    await groupRepo.createGroup({ name: "G", currency_code: "ARS" }, db);
    await groupRepo.createGroup({ name: "H", currency_code: "USD" }, db);
    expect(await countPending(db)).toBe(2);

    const engine = new SyncEngine({
      remote: createStubRemote(),
      database: db,
      pollIntervalMs: 0,
    });
    const state = await engine.syncNow();

    expect(state.syncing).toBe(false);
    expect(state.last_error).toBeNull();
    expect(state.last_synced_at).not.toBeNull();
    expect(await countPending(db)).toBe(0);
  });

  it("marca como error los items rechazados por el remoto", async () => {
    await groupRepo.createGroup({ name: "G", currency_code: "ARS" }, db);

    const engine = new SyncEngine({
      remote: createStubRemote({ failEntityTypes: ["group"] }),
      database: db,
      pollIntervalMs: 0,
    });
    await engine.syncNow();

    const items = await db.sync_queue.toArray();
    expect(items[0]?.sync_status).toBe("error");
    expect(items[0]?.attempts).toBe(1);
  });

  it("expone el estado a los suscriptores", async () => {
    const engine = new SyncEngine({
      remote: createStubRemote(),
      database: db,
      pollIntervalMs: 0,
    });
    const seen: boolean[] = [];
    const unsub = engine.subscribe((s) => seen.push(s.syncing));
    await engine.syncNow();
    unsub();
    expect(seen.length).toBeGreaterThanOrEqual(1);
  });
});
