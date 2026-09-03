import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FiviDatabase } from "@/data/db";
import { newId } from "@/data/ids";
import { SyncEngine } from "@/sync/SyncEngine";
import type { RemotePort } from "@/sync/RemotePort";

let db: FiviDatabase;

beforeEach(async () => {
  db = new FiviDatabase(`fivi-offline-${newId()}`);
  await db.open();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const idleRemote: RemotePort = {
  async push(items) {
    return { accepted_ids: items.map((i) => i.id), rejected: [] };
  },
  async pull() {
    return [];
  },
};

/**
 * Sin conexión, un grupo pedido por enlace no puede "hidratar": el estado
 * `hydrating_group_ids` no debe quedar pegado (si no, `/g/<id>` de un grupo que
 * no está en este dispositivo gira para siempre en vez de mostrar el aviso).
 */
describe("SyncEngine: hidratación de grupos sin conexión", () => {
  it("trackGroup offline limpia hydrating_group_ids en vez de dejarlo pegado", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const engine = new SyncEngine({
      remote: idleRemote,
      database: db,
      pollIntervalMs: 0,
      cloudMode: false,
    });

    engine.trackGroup("11111111-1111-1111-1111-111111111111");
    // trackGroup marca el grupo como "hidratando" de inmediato…
    expect(engine.getState().hydrating_group_ids).toEqual([
      "11111111-1111-1111-1111-111111111111",
    ]);

    // …pero la corrida (offline) lo tiene que soltar.
    await engine.syncNow(true);
    await new Promise((r) => setTimeout(r, 10));
    expect(engine.getState().hydrating_group_ids).toEqual([]);
    expect(engine.getState().online).toBe(false);
  });

  it("online, sin ese caso, no toca hydrating_group_ids de más", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    const engine = new SyncEngine({
      remote: idleRemote,
      database: db,
      pollIntervalMs: 0,
      cloudMode: false,
    });
    await engine.syncNow(true);
    expect(engine.getState().hydrating_group_ids).toEqual([]);
    expect(engine.getState().online).toBe(true);
  });
});
