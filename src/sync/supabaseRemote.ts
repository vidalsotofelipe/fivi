/**
 * Implementación de `RemotePort` contra Supabase (Postgres + Realtime),
 * secciones 24 y 32.
 *
 * - push: cada operación de la cola es un `upsert` del payload en su tabla
 *   (los borrados viajan como filas con `deleted_at`, no como DELETE físico).
 * - pull: trae filas con `updated_at > since` de las tablas del grupo. Las
 *   `expense_participants` no tienen `group_id`, así que se traen por
 *   `expense_id`.
 * - subscribe: canal Realtime por los grupos abiertos. Entrega los cambios de
 *   las 4 tablas con `group_id`; el motor, además, dispara un pull para
 *   reconciliar `expense_participants` y cualquier cosa que se haya perdido.
 *
 * Resolución de conflictos: la hace `applyRemoteChanges` (LWW por `updated_at`).
 * El servidor NO reescribe `updated_at` en el upsert (ver migración 0002), así
 * que gana el reloj del cliente que escribió último.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RemotePort, RemoteSubscription } from "./RemotePort";
import type { PushResult, RemoteChange, SyncQueueItem } from "./types";
import { ENTITY_BY_TABLE, TABLE_BY_ENTITY } from "./entities";

type Row = Record<string, unknown> & {
  id: string;
  updated_at: string;
  version: number;
  deleted_at: string | null;
};

function rowToChange(table: string, row: Row): RemoteChange {
  return {
    entity_type: ENTITY_BY_TABLE[table]!,
    entity_id: row.id,
    payload: row,
    updated_at: row.updated_at,
    version: row.version,
    deleted_at: row.deleted_at ?? null,
  };
}

const GROUP_SCOPED = ["participants", "expenses", "payments"] as const;
const REALTIME_TABLES = ["groups", "participants", "expenses", "payments"] as const;

export function createSupabaseRemote(client: SupabaseClient): RemotePort {
  return {
    async push(items: SyncQueueItem[]): Promise<PushResult> {
      const accepted_ids: string[] = [];
      const rejected: { id: string; error: string }[] = [];

      const byTable = new Map<string, SyncQueueItem[]>();
      for (const item of items) {
        const table = TABLE_BY_ENTITY[item.entity_type];
        const bucket = byTable.get(table);
        if (bucket) bucket.push(item);
        else byTable.set(table, [item]);
      }

      for (const [table, bucket] of byTable) {
        const rows = bucket.map((b) => b.payload as Record<string, unknown>);
        const { error } = await client
          .from(table)
          .upsert(rows, { onConflict: "id" });
        if (error) {
          for (const b of bucket) {
            rejected.push({ id: b.id, error: error.message });
          }
        } else {
          for (const b of bucket) accepted_ids.push(b.id);
        }
      }

      return { accepted_ids, rejected };
    },

    async pull({
      group_ids,
      since,
    }: {
      group_ids: string[];
      since: string | null;
    }): Promise<RemoteChange[]> {
      if (group_ids.length === 0) return [];
      const out: RemoteChange[] = [];

      const groupsQuery = client.from("groups").select("*").in("id", group_ids);
      const { data: groups, error: groupsErr } = since
        ? await groupsQuery.gt("updated_at", since)
        : await groupsQuery;
      if (groupsErr) throw new Error(`pull groups: ${groupsErr.message}`);
      for (const row of (groups ?? []) as Row[]) {
        out.push(rowToChange("groups", row));
      }

      for (const table of GROUP_SCOPED) {
        const q = client.from(table).select("*").in("group_id", group_ids);
        const { data, error } = since ? await q.gt("updated_at", since) : await q;
        if (error) throw new Error(`pull ${table}: ${error.message}`);
        for (const row of (data ?? []) as Row[]) {
          out.push(rowToChange(table, row));
        }
      }

      // expense_participants: por expense_id de los grupos.
      const { data: expIdRows, error: expIdErr } = await client
        .from("expenses")
        .select("id")
        .in("group_id", group_ids);
      if (expIdErr) throw new Error(`pull expense ids: ${expIdErr.message}`);
      const expenseIds = ((expIdRows ?? []) as { id: string }[]).map((r) => r.id);
      if (expenseIds.length > 0) {
        const q = client
          .from("expense_participants")
          .select("*")
          .in("expense_id", expenseIds);
        const { data, error } = since ? await q.gt("updated_at", since) : await q;
        if (error) throw new Error(`pull expense_participants: ${error.message}`);
        for (const row of (data ?? []) as Row[]) {
          out.push(rowToChange("expense_participants", row));
        }
      }

      return out;
    },

    subscribe({
      group_ids,
      onChange,
    }: {
      group_ids: string[];
      onChange: (changes: RemoteChange[]) => void;
    }): RemoteSubscription {
      const list = `(${group_ids.join(",")})`;
      const channel = client.channel(`fivi:${group_ids.join(",") || "none"}`);

      for (const table of REALTIME_TABLES) {
        channel.on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table,
            filter: table === "groups" ? `id=in.${list}` : `group_id=in.${list}`,
          },
          (payload) => {
            const raw = payload.new as Row | Record<string, never>;
            const row = raw && "id" in raw ? (raw as Row) : (payload.old as Row);
            if (row && row.id) onChange([rowToChange(table, row)]);
          },
        );
      }

      channel.subscribe();
      return {
        unsubscribe: () => {
          void client.removeChannel(channel);
        },
      };
    },
  };
}
