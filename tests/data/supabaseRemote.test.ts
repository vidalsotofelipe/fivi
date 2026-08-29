import { describe, expect, it } from "vitest";
import { createSupabaseRemote } from "@/sync/supabaseRemote";
import type { SyncQueueItem } from "@/sync/types";

/**
 * Fake mínimo del cliente de Supabase: soporta el subconjunto de la query API
 * que usa `supabaseRemote` (from/select/in/gt/upsert y channel/on/subscribe).
 */
function makeFakeClient(tables: Record<string, Record<string, unknown>[]>) {
  const upserts: { table: string; rows: Record<string, unknown>[] }[] = [];

  function builder(table: string) {
    let rows = [...(tables[table] ?? [])];
    const thenable = {
      select() {
        return thenable;
      },
      in(column: string, values: unknown[]) {
        rows = rows.filter((r) => values.includes(r[column]));
        return thenable;
      },
      gt(column: string, value: string) {
        rows = rows.filter((r) => String(r[column]) > value);
        return thenable;
      },
      upsert(newRows: Record<string, unknown>[]) {
        upserts.push({ table, rows: newRows });
        return Promise.resolve({ data: newRows, error: null });
      },
      then(resolve: (v: { data: unknown[]; error: null }) => void) {
        resolve({ data: rows, error: null });
      },
    };
    return thenable;
  }

  const client = {
    from: (table: string) => builder(table),
    channel: () => {
      const ch = {
        on: () => ch,
        subscribe: () => ch,
      };
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
    sync_status: "pending",
    error: null,
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
});

describe("supabaseRemote.pull", () => {
  it("trae filas de los grupos y mapea a RemoteChange", async () => {
    const { client } = makeFakeClient({
      groups: [
        { id: "g1", updated_at: "2026-08-01T00:00:00Z", version: 1, deleted_at: null },
      ],
      participants: [
        { id: "p1", group_id: "g1", updated_at: "2026-08-02T00:00:00Z", version: 1, deleted_at: null },
        { id: "pX", group_id: "otro", updated_at: "2026-08-02T00:00:00Z", version: 1, deleted_at: null },
      ],
      expenses: [
        { id: "e1", group_id: "g1", updated_at: "2026-08-03T00:00:00Z", version: 1, deleted_at: null },
      ],
      payments: [],
      expense_participants: [
        { id: "ep1", expense_id: "e1", updated_at: "2026-08-03T00:00:00Z", version: 1, deleted_at: null },
      ],
    });
    const remote = createSupabaseRemote(client);

    const changes = await remote.pull({ group_ids: ["g1"], since: null });
    const kinds = changes.map((c) => `${c.entity_type}:${c.entity_id}`).sort();
    expect(kinds).toEqual([
      "expense:e1",
      "expense_participant:ep1",
      "group:g1",
      "participant:p1",
    ]);
  });

  it("filtra por 'since' con updated_at", async () => {
    const { client } = makeFakeClient({
      groups: [],
      participants: [
        { id: "old", group_id: "g1", updated_at: "2026-01-01T00:00:00Z", version: 1, deleted_at: null },
        { id: "new", group_id: "g1", updated_at: "2026-09-01T00:00:00Z", version: 1, deleted_at: null },
      ],
      expenses: [],
      payments: [],
      expense_participants: [],
    });
    const remote = createSupabaseRemote(client);

    const changes = await remote.pull({
      group_ids: ["g1"],
      since: "2026-06-01T00:00:00Z",
    });
    expect(changes.map((c) => c.entity_id)).toEqual(["new"]);
  });

  it("devuelve vacío si no hay grupos", async () => {
    const { client } = makeFakeClient({});
    const remote = createSupabaseRemote(client);
    expect(await remote.pull({ group_ids: [], since: null })).toEqual([]);
  });
});
