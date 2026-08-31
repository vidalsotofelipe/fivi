import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { FiviDatabase } from "@/data/db";
import { newId } from "@/data/ids";
import * as groupRepo from "@/data/repositories/groupRepo";
import * as participantRepo from "@/data/repositories/participantRepo";
import {
  countPending,
  getPendingItems,
  markStatus,
  requeueStaleSyncing,
} from "@/sync/queue";
import { createStubRemote } from "@/sync/stubRemote";
import { SyncEngine } from "@/sync/SyncEngine";
import { ACCESS_DENIED_MESSAGE } from "@/sync/accessError";
import type { RemotePort } from "@/sync/RemotePort";
import type { Group } from "@/domain/types";

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

  it("aplica en la base local los cambios que devuelve el pull", async () => {
    const remoteGroup: Group = {
      id: newId(),
      name: "Grupo de otro dispositivo",
      description: null,
      currency_code: "EUR",
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-01T00:00:00.000Z",
      version: 1,
      deleted_at: null,
    };
    const remote: RemotePort = {
      push: async () => ({ accepted_ids: [], rejected: [] }),
      pull: async () => [
        {
          entity_type: "group",
          entity_id: remoteGroup.id,
          payload: remoteGroup,
          updated_at: remoteGroup.updated_at,
          version: remoteGroup.version,
          deleted_at: null,
        },
      ],
    };

    const engine = new SyncEngine({ remote, database: db, pollIntervalMs: 0 });
    await engine.syncNow();

    expect((await db.groups.get(remoteGroup.id))?.name).toBe(
      "Grupo de otro dispositivo",
    );
  });

  it("trackGroup trae por enlace un grupo que no está local", async () => {
    const remoteGroup: Group = {
      id: newId(),
      name: "Grupo compartido por enlace",
      description: null,
      currency_code: "USD",
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-01T00:00:00.000Z",
      version: 1,
      deleted_at: null,
    };
    const pulled: Array<{ group_ids: string[]; cursor: number | null }> = [];
    const remote: RemotePort = {
      push: async () => ({ accepted_ids: [], rejected: [] }),
      pull: async (params) => {
        pulled.push(params);
        return params.group_ids.includes(remoteGroup.id)
          ? [
              {
                entity_type: "group",
                entity_id: remoteGroup.id,
                payload: remoteGroup,
                updated_at: remoteGroup.updated_at,
                version: remoteGroup.version,
                deleted_at: null,
              },
            ]
          : [];
      },
    };

    const engine = new SyncEngine({ remote, database: db, pollIntervalMs: 0 });
    await engine.syncNow(); // sin grupos locales -> pull vacío
    expect(await db.groups.count()).toBe(0);

    engine.trackGroup(remoteGroup.id);
    await new Promise((r) => setTimeout(r, 10)); // deja correr el syncNow disparado

    expect(pulled.at(-1)?.group_ids).toContain(remoteGroup.id);
    expect(pulled.at(-1)?.cursor).toBeNull(); // pull completo al abrir por enlace
    expect((await db.groups.get(remoteGroup.id))?.name).toBe(
      "Grupo compartido por enlace",
    );
  });

  it("mantiene el grupo 'hydrating' hasta que el remoto real hace el pull (cloudMode)", async () => {
    const remoteGroup: Group = {
      id: newId(),
      name: "Grupo remoto",
      description: null,
      currency_code: "USD",
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-01T00:00:00.000Z",
      version: 1,
      deleted_at: null,
    };
    const realRemote: RemotePort = {
      push: async () => ({ accepted_ids: [], rejected: [] }),
      pull: async ({ group_ids }) =>
        group_ids.includes(remoteGroup.id)
          ? [
              {
                entity_type: "group",
                entity_id: remoteGroup.id,
                payload: remoteGroup,
                updated_at: remoteGroup.updated_at,
                version: remoteGroup.version,
                deleted_at: null,
              },
            ]
          : [],
    };

    const engine = new SyncEngine({
      remote: createStubRemote(),
      database: db,
      pollIntervalMs: 0,
      cloudMode: true,
    });

    engine.trackGroup(remoteGroup.id);
    await new Promise((r) => setTimeout(r, 20)); // deja correr el sync con stub
    // Con el stub todavía activo, el grupo sigue "cargando".
    expect(engine.getState().hydrating_group_ids).toContain(remoteGroup.id);
    expect(await db.groups.count()).toBe(0);

    // Entra el remoto real: se hace el pull y deja de estar "cargando".
    await engine.setRemote(realRemote);
    await new Promise((r) => setTimeout(r, 20)); // por si hubo re-run encolado
    expect(engine.getState().hydrating_group_ids).not.toContain(remoteGroup.id);
    expect((await db.groups.get(remoteGroup.id))?.name).toBe("Grupo remoto");
  });

  it("usa el cursor server-owned: primer pull completo, luego incremental", async () => {
    const calls: Array<number | null> = [];
    let batch = 0;
    const remote: RemotePort = {
      push: async () => ({ accepted_ids: [], rejected: [] }),
      pull: async ({ cursor }) => {
        calls.push(cursor);
        if (batch++ === 0) {
          return [
            {
              entity_type: "group",
              entity_id: "x",
              payload: {
                id: "x",
                name: "R",
                description: null,
                currency_code: "USD",
                created_at: "2026-01-01T00:00:00.000Z",
                updated_at: "2026-01-01T00:00:00.000Z",
                version: 1,
                deleted_at: null,
              },
              updated_at: "2026-01-01T00:00:00.000Z",
              version: 1,
              deleted_at: null,
              sync_revision: 42,
            },
          ];
        }
        return [];
      },
    };
    const engine = new SyncEngine({ remote, database: db, pollIntervalMs: 0 });

    await engine.syncNow(); // 1: cursor null (completo)
    await engine.syncNow(); // 2: cursor 42 (incremental)

    expect(calls[0]).toBeNull();
    expect(calls[1]).toBe(42);
    engine.stop();
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

describe("SyncEngine: acceso denegado (RLS) y offline-first", () => {
  it("un rechazo por falta de acceso NO borra el dato local y se informa", async () => {
    await groupRepo.createGroup({ name: "G", currency_code: "ARS" }, db);
    const [item] = await getPendingItems(db);

    const remote: RemotePort = {
      push: async () => ({
        accepted_ids: [],
        rejected: [{ id: item!.id, error: ACCESS_DENIED_MESSAGE }],
      }),
      pull: async () => [],
    };
    const engine = new SyncEngine({ remote, database: db, pollIntervalMs: 0 });
    const state = await engine.syncNow();

    // el grupo local sigue estando
    expect(await db.groups.count()).toBe(1);
    // el item quedó en error (no se borró) y el estado lo refleja
    const row = await db.sync_queue.get(item!.id);
    expect(row?.sync_status).toBe("error");
    expect(state.access_error).toBe(ACCESS_DENIED_MESSAGE);
  });

  it("un pull sin ese grupo no lo borra localmente", async () => {
    const g = await groupRepo.createGroup(
      { name: "Local", currency_code: "ARS" },
      db,
    );
    const remote: RemotePort = {
      push: async (items) => ({
        accepted_ids: items.map((i) => i.id),
        rejected: [],
      }),
      pull: async () => [], // el servidor no devuelve nada para este grupo
    };
    const engine = new SyncEngine({ remote, database: db, pollIntervalMs: 0 });
    await engine.syncNow();

    expect((await db.groups.get(g.id))?.name).toBe("Local");
  });

  it("el CRUD local funciona aunque el remoto sea inalcanzable", async () => {
    const remote: RemotePort = {
      push: async () => {
        throw new Error("network unreachable");
      },
      pull: async () => {
        throw new Error("network unreachable");
      },
    };
    const engine = new SyncEngine({ remote, database: db, pollIntervalMs: 0 });

    const g = await groupRepo.createGroup(
      { name: "Sin red", currency_code: "ARS" },
      db,
    );
    await participantRepo.addParticipant(g.id, "Ana", db);
    await engine.syncNow().catch(() => {});

    expect((await groupRepo.getGroup(g.id, db))?.name).toBe("Sin red");
    expect(await participantRepo.listParticipants(g.id, db)).toHaveLength(1);
    // nada se perdió: sigue pendiente de sincronizar
    expect(await countPending(db)).toBe(2);
  });

  it("una corrida limpia baja el access_error", async () => {
    await groupRepo.createGroup({ name: "G", currency_code: "ARS" }, db);
    const [item] = await getPendingItems(db);
    let deny = true;
    const remote: RemotePort = {
      push: async (items) =>
        deny
          ? {
              accepted_ids: [],
              rejected: [{ id: item!.id, error: ACCESS_DENIED_MESSAGE }],
            }
          : { accepted_ids: items.map((i) => i.id), rejected: [] },
      pull: async () => [],
    };
    const engine = new SyncEngine({ remote, database: db, pollIntervalMs: 0 });

    let state = await engine.syncNow();
    expect(state.access_error).toBe(ACCESS_DENIED_MESSAGE);

    deny = false;
    state = await engine.syncNow(true);
    expect(state.access_error).toBeNull();
  });
});
