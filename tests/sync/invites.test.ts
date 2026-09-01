import "fake-indexeddb/auto";
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FiviDatabase } from "@/data/db";
import { newId } from "@/data/ids";
import { SyncEngine } from "@/sync/SyncEngine";
import type { RemotePort } from "@/sync/RemotePort";
import {
  generateInviteToken,
  hashInviteToken,
  hashInviteTokenBytea,
  toHex,
} from "@/lib/invites";

let db: FiviDatabase;

beforeEach(async () => {
  db = new FiviDatabase(`fivi-invites-${newId()}`);
  await db.open();
});

function baseRemote(over: Partial<RemotePort> = {}): RemotePort {
  return {
    push: async () => ({ accepted_ids: [], rejected: [] }),
    pull: async () => [],
    ...over,
  };
}

describe("helpers de token de invitación", () => {
  it("genera tokens únicos, largos y url-safe", () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(42);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("hashInviteToken == SHA-256 de los bytes UTF-8 (igual que Postgres)", async () => {
    const token = "hola-mundo";
    const got = toHex(await hashInviteToken(token));
    const expected = createHash("sha256").update(token, "utf8").digest("hex");
    expect(got).toBe(expected);
  });

  it("hashInviteTokenBytea devuelve el literal \\x… para PostgREST", async () => {
    const token = generateInviteToken();
    const bytea = await hashInviteTokenBytea(token);
    expect(bytea).toBe("\\x" + toHex(await hashInviteToken(token)));
  });
});

describe("SyncEngine.redeemInvite", () => {
  it("canjea contra el remoto y empieza a seguir el grupo (pull completo)", async () => {
    const groupId = newId();
    const pulls: Array<number | null> = [];
    const remote = baseRemote({
      redeemInvite: vi.fn(async ({ token }) => {
        expect(token).toBe("tok-123");
        return { group_id: groupId };
      }),
      pull: async ({ cursor }) => {
        pulls.push(cursor);
        return [];
      },
    });

    const engine = new SyncEngine({ remote, database: db, pollIntervalMs: 0 });
    const returned = await engine.redeemInvite("tok-123");
    await new Promise((r) => setTimeout(r, 10)); // deja correr el syncNow disparado

    expect(returned).toBe(groupId);
    expect(remote.redeemInvite).toHaveBeenCalledOnce();
    // trackGroup fuerza un pull completo (cursor null) que incluye el grupo nuevo
    expect(pulls).toContain(null);
    engine.stop();
  });

  it("sin remoto de invitaciones (modo local) lanza un error claro", async () => {
    const engine = new SyncEngine({
      remote: baseRemote(),
      database: db,
      pollIntervalMs: 0,
    });
    await expect(engine.redeemInvite("x")).rejects.toThrow(/Supabase/i);
  });

  it("modo cloud: remote_ready arranca en false y el canje sólo anda tras setRemote", async () => {
    // Regresión: abrir directamente `/join/<token>` mostraba "requieren Supabase
    // configurado" porque la página actuaba con `remote_ready` en true (sembrado
    // desde INITIAL) mientras el motor seguía en el stub. `getState()` debe
    // reflejar el estado real: en cloud, `remote_ready` es false hasta setRemote.
    const engine = new SyncEngine({
      remote: baseRemote(), // stub: sin redeemInvite
      database: db,
      pollIntervalMs: 0,
      cloudMode: true,
    });
    expect(engine.getState().remote_ready).toBe(false);
    await expect(engine.redeemInvite("tok")).rejects.toThrow(/Supabase/i);

    await engine.setRemote(
      baseRemote({ redeemInvite: async () => ({ group_id: "g-real" }) }),
    );
    expect(engine.getState().remote_ready).toBe(true);
    await expect(engine.redeemInvite("tok")).resolves.toBe("g-real");
  });
});

describe("SyncEngine.createInvite", () => {
  it("genera el token localmente y manda sólo su hash", async () => {
    const captured: { token_hash?: string } = {};
    const remote = baseRemote({
      createInvite: vi.fn(async (params) => {
        captured.token_hash = params.token_hash;
        return { id: "inv-1" };
      }),
      redeemInvite: async () => ({ group_id: "g" }),
    });

    const engine = new SyncEngine({ remote, database: db, pollIntervalMs: 0 });
    const { token, id } = await engine.createInvite("group-1");

    expect(id).toBe("inv-1");
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    // el servidor recibe el hash, nunca el token crudo
    expect(captured.token_hash).toBe(await hashInviteTokenBytea(token));
    expect(captured.token_hash).not.toContain(token);
  });

  it("traduce expiresInDays a un ISO futuro", async () => {
    let sentExpires: string | null = "unset";
    const remote = baseRemote({
      createInvite: async (params) => {
        sentExpires = params.expires_at;
        return { id: "i" };
      },
      redeemInvite: async () => ({ group_id: "g" }),
    });
    const engine = new SyncEngine({ remote, database: db, pollIntervalMs: 0 });

    await engine.createInvite("g", { expiresInDays: 7 });
    expect(sentExpires).not.toBeNull();
    expect(new Date(sentExpires as string).getTime()).toBeGreaterThan(Date.now());

    await engine.createInvite("g");
    expect(sentExpires).toBeNull();
  });
});

describe("SyncEngine.listInvites / revokeInvite / getGroupRole", () => {
  it("delegan en el remoto y toleran su ausencia", async () => {
    const withRemote = new SyncEngine({
      remote: baseRemote({
        listInvites: async () => [
          {
            id: "i1",
            created_at: "2026-01-01T00:00:00Z",
            created_by: "u1",
            expires_at: null,
            revoked_at: null,
            uses: 0,
            max_uses: null,
          },
        ],
        revokeInvite: vi.fn(async () => {}),
        getGroupRole: async () => "owner",
      }),
      database: db,
      pollIntervalMs: 0,
    });
    expect(await withRemote.listInvites("g")).toHaveLength(1);
    expect(await withRemote.getGroupRole("g")).toBe("owner");
    await withRemote.revokeInvite("i1");

    const localOnly = new SyncEngine({
      remote: baseRemote(),
      database: db,
      pollIntervalMs: 0,
    });
    expect(await localOnly.listInvites("g")).toEqual([]);
    expect(await localOnly.getGroupRole("g")).toBeNull();
    await expect(localOnly.revokeInvite("i1")).resolves.toBeUndefined();
  });
});
