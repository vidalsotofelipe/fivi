import { describe, expect, it } from "vitest";
import { PULL_PAGE_SIZE, createSupabaseRemote } from "@/sync/supabaseRemote";
import { ACCESS_DENIED_MESSAGE } from "@/sync/accessError";
import type { SyncQueueItem } from "@/sync/types";

/**
 * Fake mínimo del cliente de Supabase: soporta el subconjunto de la query API
 * que usa `supabaseRemote` (from/select/in/gt/order/range/upsert y
 * channel/on/subscribe).
 */
function makeFakeClient(
  tables: Record<string, Record<string, unknown>[]>,
  opts: { upsertError?: { code?: string; message: string } } = {},
) {
  const upserts: { table: string; rows: Record<string, unknown>[] }[] = [];

  function builder(table: string) {
    let rows = [...(tables[table] ?? [])];
    let selectCols: string | null = null;

    const thenable = {
      select(cols: string) {
        selectCols = cols;
        return thenable;
      },
      in(column: string, values: unknown[]) {
        rows = rows.filter((r) => values.includes(r[column]));
        return thenable;
      },
      gt(column: string, value: unknown) {
        // PostgREST/Postgres devuelven 400 si se filtra una columna uuid con
        // string vacío (`id=gt.` -> "invalid input syntax for type uuid"). El
        // fake lo reproduce para no dejar pasar ese bug.
        if (column === "id" && value === "") {
          throw new Error('invalid input syntax for type uuid: ""');
        }
        const num =
          typeof value === "number" ||
          (typeof value === "string" && value !== "" && !isNaN(Number(value)));
        rows = rows.filter((r) =>
          num
            ? Number(r[column]) > Number(value)
            : String(r[column]) > String(value),
        );
        return thenable;
      },
      order(column: string, opts: { ascending: boolean }) {
        rows = [...rows].sort((a, b) => {
          const av = a[column] as number | string;
          const bv = b[column] as number | string;
          const cmp = av < bv ? -1 : av > bv ? 1 : 0;
          return opts.ascending ? cmp : -cmp;
        });
        return thenable;
      },
      limit(count: number) {
        rows = rows.slice(0, count);
        return thenable;
      },
      upsert(newRows: Record<string, unknown>[]) {
        upserts.push({ table, rows: newRows });
        return Promise.resolve(
          opts.upsertError
            ? { data: null, error: opts.upsertError }
            : { data: newRows, error: null },
        );
      },
      then(resolve: (v: { data: unknown[]; error: null }) => void) {
        const data =
          selectCols && selectCols !== "*"
            ? rows.map((r) => {
                const picked: Record<string, unknown> = {};
                for (const c of selectCols!.split(",")) picked[c.trim()] = r[c.trim()];
                return picked;
              })
            : rows;
        resolve({ data, error: null });
      },
    };
    return thenable;
  }

  const client = {
    from: (table: string) => builder(table),
    channel: () => {
      const ch = { on: () => ch, subscribe: () => ch };
      return ch;
    },
    removeChannel: () => Promise.resolve("ok"),
  };

  return { client: client as never, upserts };
}

function qItem(over: Partial<SyncQueueItem>): SyncQueueItem {
  return {
    id: "q" + Math.random().toString(36).slice(2),
    operation: "CREATE",
    entity_type: "group",
    entity_id: "e1",
    payload: { id: "e1" },
    created_at: "2026-01-01T00:00:00.000Z",
    attempts: 0,
    last_attempt_at: null,
    next_attempt_at: null,
    sync_status: "pending",
    error: null,
    ...over,
  };
}

function row(over: Record<string, unknown>): Record<string, unknown> {
  return {
    updated_at: "2026-08-01T00:00:00Z",
    version: 1,
    deleted_at: null,
    sync_revision: 1,
    ...over,
  };
}

describe("supabaseRemote.push", () => {
  it("agrupa por tabla y hace upsert de cada payload", async () => {
    const { client, upserts } = makeFakeClient({});
    const remote = createSupabaseRemote(client);

    const items = [
      qItem({ entity_type: "group", payload: { id: "g1", name: "G" } }),
      qItem({ entity_type: "participant", payload: { id: "p1" } }),
      qItem({ entity_type: "participant", payload: { id: "p2" } }),
      qItem({
        entity_type: "expense_participant",
        payload: { id: "ep1" },
        operation: "DELETE",
      }),
    ];
    const res = await remote.push(items);

    expect(res.accepted_ids).toHaveLength(4);
    expect(res.rejected).toHaveLength(0);
    const byTable = Object.fromEntries(
      upserts.map((u) => [u.table, u.rows.length]),
    );
    expect(byTable).toEqual({
      groups: 1,
      participants: 2,
      expense_participants: 1,
    });
  });

  it("hace upsert en orden de dependencia aunque los items lleguen mezclados", async () => {
    const { client, upserts } = makeFakeClient({});
    const remote = createSupabaseRemote(client);

    // orden de llegada deliberadamente al revés
    await remote.push([
      qItem({ entity_type: "payment", payload: { id: "pay1" } }),
      qItem({ entity_type: "expense_participant", payload: { id: "ep1" } }),
      qItem({ entity_type: "expense", payload: { id: "e1" } }),
      qItem({ entity_type: "participant", payload: { id: "p1" } }),
      qItem({ entity_type: "group", payload: { id: "g1" } }),
    ]);

    expect(upserts.map((u) => u.table)).toEqual([
      "groups",
      "participants",
      "expenses",
      "expense_participants",
      "payments",
    ]);
  });

  it("traduce un rechazo por RLS (42501) al mensaje de acceso denegado", async () => {
    const { client } = makeFakeClient(
      {},
      { upsertError: { code: "42501", message: "new row violates row-level security policy" } },
    );
    const remote = createSupabaseRemote(client);

    const res = await remote.push([
      qItem({ entity_type: "expense", payload: { id: "e1" } }),
    ]);
    expect(res.accepted_ids).toHaveLength(0);
    expect(res.rejected).toEqual([{ id: expect.any(String), error: ACCESS_DENIED_MESSAGE }]);
  });
});

describe("supabaseRemote.pull", () => {
  it("trae filas de los grupos y mapea a RemoteChange (incl. sync_revision)", async () => {
    const { client } = makeFakeClient({
      groups: [row({ id: "g1", sync_revision: 5 })],
      participants: [
        row({ id: "p1", group_id: "g1", sync_revision: 6 }),
        row({ id: "pX", group_id: "otro", sync_revision: 7 }),
      ],
      expenses: [row({ id: "e1", group_id: "g1", sync_revision: 8 })],
      payments: [],
      expense_participants: [row({ id: "ep1", expense_id: "e1", sync_revision: 9 })],
    });
    const remote = createSupabaseRemote(client);

    const changes = await remote.pull({ group_ids: ["g1"], cursor: null });
    const kinds = changes.map((c) => `${c.entity_type}:${c.entity_id}`).sort();
    expect(kinds).toEqual([
      "expense:e1",
      "expense_participant:ep1",
      "group:g1",
      "participant:p1",
    ]);
    expect(changes.find((c) => c.entity_id === "ep1")?.sync_revision).toBe(9);
  });

  it("con cursor, sólo trae filas con sync_revision > cursor", async () => {
    const { client } = makeFakeClient({
      groups: [],
      participants: [
        row({ id: "old", group_id: "g1", sync_revision: 10 }),
        row({ id: "new", group_id: "g1", sync_revision: 20 }),
      ],
      expenses: [],
      payments: [],
      expense_participants: [],
    });
    const remote = createSupabaseRemote(client);

    const changes = await remote.pull({ group_ids: ["g1"], cursor: 15 });
    expect(changes.map((c) => c.entity_id)).toEqual(["new"]);
  });

  it("pagina: junta varias páginas cuando hay más filas que PULL_PAGE_SIZE", async () => {
    const many = Array.from({ length: PULL_PAGE_SIZE + 37 }, (_, i) =>
      row({ id: `p${i}`, group_id: "g1", sync_revision: i + 1 }),
    );
    const { client } = makeFakeClient({
      groups: [],
      participants: many,
      expenses: [],
      payments: [],
      expense_participants: [],
    });
    const remote = createSupabaseRemote(client);

    const changes = await remote.pull({ group_ids: ["g1"], cursor: null });
    const participantChanges = changes.filter(
      (c) => c.entity_type === "participant",
    );
    expect(participantChanges).toHaveLength(PULL_PAGE_SIZE + 37);
    // sin duplicados
    expect(new Set(participantChanges.map((c) => c.entity_id)).size).toBe(
      PULL_PAGE_SIZE + 37,
    );
  });

  it("devuelve vacío si no hay grupos", async () => {
    const { client } = makeFakeClient({});
    const remote = createSupabaseRemote(client);
    expect(await remote.pull({ group_ids: [], cursor: null })).toEqual([]);
  });

  it("la paginación de ids de expenses no arranca con un cursor vacío (400 de Postgres)", async () => {
    // Regresión: `let idCursor = ""` hacía `.gt("id", "")` -> PostgREST 400
    // "invalid input syntax for type uuid". El fake ahora lanza en ese caso.
    const { client } = makeFakeClient({
      groups: [],
      participants: [],
      expenses: [row({ id: "e1", group_id: "g1", sync_revision: 5 })],
      payments: [],
      expense_participants: [
        row({ id: "ep1", expense_id: "e1", sync_revision: 6 }),
      ],
    });
    const remote = createSupabaseRemote(client);

    const changes = await remote.pull({ group_ids: ["g1"], cursor: null });
    expect(
      changes.map((c) => `${c.entity_type}:${c.entity_id}`).sort(),
    ).toEqual(["expense:e1", "expense_participant:ep1"]);
  });
});

/**
 * Fake acotado para la API de invitaciones: from().insert().select().single(),
 * from().select().eq().order(), from().update().eq(), from().select().eq().maybeSingle()
 * y rpc().
 */
function makeInviteClient(seed: {
  invites?: Record<string, unknown>[];
  members?: Record<string, unknown>[];
  rpc?: Record<string, unknown>;
}) {
  const calls: {
    inserts: Record<string, unknown>[];
    updates: Record<string, unknown>[];
    rpc: { name: string; args: unknown }[];
  } = { inserts: [], updates: [], rpc: [] };

  function builder(table: string) {
    let rows = [
      ...(table === "group_invites" ? (seed.invites ?? []) : []),
      ...(table === "group_members" ? (seed.members ?? []) : []),
    ];
    const q = {
      insert(payload: Record<string, unknown>) {
        calls.inserts.push({ table, payload });
        rows = [{ id: "inv-generated", ...payload }];
        return q;
      },
      update(patch: Record<string, unknown>) {
        calls.updates.push({ table, patch });
        return q;
      },
      select() {
        return q;
      },
      eq(column: string, value: unknown) {
        rows = rows.filter((r) => r[column] === value);
        return q;
      },
      order() {
        return q;
      },
      single() {
        return Promise.resolve({ data: rows[0] ?? null, error: null });
      },
      maybeSingle() {
        return Promise.resolve({ data: rows[0] ?? null, error: null });
      },
      then(resolve: (v: { data: unknown[]; error: null }) => void) {
        resolve({ data: rows, error: null });
      },
    };
    return q;
  }

  const client = {
    from: (table: string) => builder(table),
    rpc: (name: string, args: unknown) => {
      calls.rpc.push({ name, args });
      return Promise.resolve({ data: seed.rpc?.[name] ?? null, error: null });
    },
  };
  return { client: client as never, calls };
}

describe("supabaseRemote — invitaciones", () => {
  it("createInvite inserta el hash y devuelve el id", async () => {
    const { client, calls } = makeInviteClient({});
    const remote = createSupabaseRemote(client);

    const res = await remote.createInvite!({
      group_id: "g1",
      token_hash: "\\xdeadbeef",
      expires_at: null,
      max_uses: null,
    });

    expect(res.id).toBe("inv-generated");
    expect(calls.inserts[0]).toMatchObject({
      table: "group_invites",
      payload: { group_id: "g1", token_hash: "\\xdeadbeef" },
    });
  });

  it("redeemInvite llama a la RPC y devuelve el group_id", async () => {
    const { client, calls } = makeInviteClient({
      rpc: { redeem_group_invite: "group-42" },
    });
    const remote = createSupabaseRemote(client);

    const res = await remote.redeemInvite!({ token: "raw-token" });
    expect(res).toEqual({ group_id: "group-42" });
    expect(calls.rpc[0]).toEqual({
      name: "redeem_group_invite",
      args: { p_token: "raw-token" },
    });
  });

  it("listInvites devuelve las filas y revokeInvite marca revoked_at", async () => {
    const { client, calls } = makeInviteClient({
      invites: [
        { id: "i1", group_id: "g1", created_at: "2026-01-01T00:00:00Z" },
      ],
    });
    const remote = createSupabaseRemote(client);

    expect(await remote.listInvites!("g1")).toHaveLength(1);

    await remote.revokeInvite!("i1");
    expect(calls.updates[0]?.patch).toHaveProperty("revoked_at");
  });

  it("getGroupRole normaliza el rol o devuelve null", async () => {
    const owner = makeInviteClient({ members: [{ group_id: "g1", role: "owner" }] });
    expect(
      await createSupabaseRemote(owner.client).getGroupRole!("g1"),
    ).toBe("owner");

    const none = makeInviteClient({ members: [] });
    expect(
      await createSupabaseRemote(none.client).getGroupRole!("g1"),
    ).toBeNull();
  });
});
