/**
 * Implementación de `RemotePort` contra Supabase (Postgres + Realtime),
 * secciones 24 y 32.
 *
 * - push: cada operación de la cola es un `upsert` del payload en su tabla
 *   (los borrados viajan como filas con `deleted_at`, no como DELETE físico).
 * - pull: trae filas con `sync_revision > cursor` (columna server-owned, ver
 *   migración 0003), ordenadas por `sync_revision`, paginadas. Las
 *   `expense_participants` no tienen `group_id`, así que se traen por
 *   `expense_id`.
 * - subscribe: canal Realtime por los grupos abiertos. Entrega los cambios de
 *   las 4 tablas con `group_id`; el motor, además, dispara un pull para
 *   reconciliar `expense_participants` y cualquier cosa que se haya perdido.
 *
 * Resolución de conflictos: la hace `applyRemoteChanges` (LWW por `updated_at`).
 * El servidor NO reescribe `updated_at` en el upsert (ver migración 0002), así
 * que gana el reloj del cliente que escribió último. `sync_revision` es sólo el
 * cursor de "qué falta traer", ortogonal a la resolución de conflictos.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GroupRole, RemotePort, RemoteSubscription } from "./RemotePort";
import type {
  InviteInfo,
  PushResult,
  RemoteChange,
  SyncQueueItem,
} from "./types";
import { ENTITY_BY_TABLE, SYNC_TABLES, TABLE_BY_ENTITY } from "./entities";
import { ACCESS_DENIED_MESSAGE, isAccessError } from "./accessError";

/** Tamaño de página del pull (fase 4). PostgREST corta las respuestas grandes. */
export const PULL_PAGE_SIZE = 500;

type Row = Record<string, unknown> & {
  id: string;
  updated_at: string;
  version: number;
  deleted_at: string | null;
  sync_revision: number;
};

function rowToChange(table: string, row: Row): RemoteChange {
  return {
    entity_type: ENTITY_BY_TABLE[table]!,
    entity_id: row.id,
    payload: row,
    updated_at: row.updated_at,
    version: row.version,
    deleted_at: row.deleted_at ?? null,
    sync_revision: row.sync_revision,
  };
}

const GROUP_SCOPED = ["participants", "expenses", "payments"] as const;
const REALTIME_TABLES = ["groups", "participants", "expenses", "payments"] as const;

/** Trocea una lista larga para no reventar el largo de URL de un `.in(...)`. */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Subconjunto encadenable de PostgREST que usa el pull (tipado laxo a propósito). */
interface PgQuery {
  in(column: string, values: readonly unknown[]): PgQuery;
  gt(column: string, value: unknown): PgQuery;
  order(column: string, opts: { ascending: boolean }): PgQuery;
  limit(count: number): PgQuery;
  then<R>(
    onfulfilled: (v: {
      data: unknown[] | null;
      error: { message: string } | null;
    }) => R,
  ): Promise<R>;
}

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

      // Upsert en orden de dependencia (padres primero): así las FKs compuestas
      // del servidor (fase 5) nunca rechazan un lote válido por orden.
      for (const table of SYNC_TABLES) {
        const bucket = byTable.get(table);
        if (!bucket || bucket.length === 0) continue;
        const rows = bucket.map((b) => b.payload as Record<string, unknown>);
        const { error } = await client
          .from(table)
          .upsert(rows, { onConflict: "id" });
        if (error) {
          // Rechazo por falta de acceso (RLS / sesión): mensaje claro para que la
          // UI lo distinga de un error transitorio. El dato local no se toca.
          const message = isAccessError(error)
            ? ACCESS_DENIED_MESSAGE
            : error.message;
          for (const b of bucket) {
            rejected.push({ id: b.id, error: message });
          }
        } else {
          for (const b of bucket) accepted_ids.push(b.id);
        }
      }

      return { accepted_ids, rejected };
    },

    async pull({
      group_ids,
      cursor,
    }: {
      group_ids: string[];
      cursor: number | null;
    }): Promise<RemoteChange[]> {
      if (group_ids.length === 0) return [];
      const out: RemoteChange[] = [];

      /**
       * Trae TODAS las páginas de una tabla con `sync_revision > cursor`,
       * ordenadas por `sync_revision`. **Keyset pagination**: cada página pide
       * `sync_revision > (máx de la página anterior)`. No usa offsets, así que
       * es inmune a inserts/updates concurrentes durante la paginación (una fila
       * actualizada se mueve al final por el trigger y se ve en la última
       * página; nunca se saltea ni se duplica). `scope(q)` aplica el filtro de
       * columna. Corta cuando una página trae menos de `PULL_PAGE_SIZE`.
       */
      const pullTable = async (
        table: string,
        scope: (q: PgQuery) => PgQuery,
      ): Promise<void> => {
        let pageCursor = cursor ?? 0;
        for (;;) {
          const q = scope(client.from(table).select("*") as unknown as PgQuery)
            .gt("sync_revision", pageCursor)
            .order("sync_revision", { ascending: true })
            .limit(PULL_PAGE_SIZE);
          const { data, error } = await q;
          if (error) throw new Error(`pull ${table}: ${error.message}`);
          const rows = (data ?? []) as Row[];
          for (const row of rows) out.push(rowToChange(table, row));
          if (rows.length < PULL_PAGE_SIZE) break;
          pageCursor = rows[rows.length - 1]!.sync_revision;
        }
      };

      await pullTable("groups", (q) => q.in("id", group_ids));
      for (const table of GROUP_SCOPED) {
        await pullTable(table, (q) => q.in("group_id", group_ids));
      }

      // expense_participants no tiene group_id: se trae por expense_id. Los ids
      // se piden con keyset pagination (id > último) y el `.in(...)` se trocea
      // en tandas para no reventar el largo de URL.
      const expenseIds: string[] = [];
      let idCursor = "";
      for (;;) {
        const { data, error } = await client
          .from("expenses")
          .select("id")
          .in("group_id", group_ids)
          .gt("id", idCursor)
          .order("id", { ascending: true })
          .limit(PULL_PAGE_SIZE);
        if (error) throw new Error(`pull expense ids: ${error.message}`);
        const rows = (data ?? []) as { id: string }[];
        for (const r of rows) expenseIds.push(r.id);
        if (rows.length < PULL_PAGE_SIZE) break;
        idCursor = rows[rows.length - 1]!.id;
      }
      for (const ids of chunk(expenseIds, 200)) {
        await pullTable("expense_participants", (q) => q.in("expense_id", ids));
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

    // --- Invitaciones (Etapa 7) -------------------------------------------------

    async createInvite({
      group_id,
      token_hash,
      expires_at,
      max_uses,
    }): Promise<{ id: string }> {
      const { data, error } = await client
        .from("group_invites")
        .insert({ group_id, token_hash, expires_at, max_uses })
        .select("id")
        .single();
      if (error) throw new Error(`createInvite: ${error.message}`);
      return { id: (data as { id: string }).id };
    },

    async redeemInvite({ token }): Promise<{ group_id: string }> {
      const { data, error } = await client.rpc("redeem_group_invite", {
        p_token: token,
      });
      if (error) throw new Error(error.message);
      if (typeof data !== "string") {
        throw new Error("La invitación no devolvió un grupo válido");
      }
      return { group_id: data };
    },

    async listInvites(group_id: string): Promise<InviteInfo[]> {
      const { data, error } = await client
        .from("group_invites")
        .select("id, created_at, created_by, expires_at, revoked_at, uses, max_uses")
        .eq("group_id", group_id)
        .order("created_at", { ascending: false });
      if (error) throw new Error(`listInvites: ${error.message}`);
      return (data ?? []) as InviteInfo[];
    },

    async revokeInvite(invite_id: string): Promise<void> {
      const { error } = await client
        .from("group_invites")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", invite_id);
      if (error) throw new Error(`revokeInvite: ${error.message}`);
    },

    async getGroupRole(group_id: string): Promise<GroupRole | null> {
      const { data, error } = await client
        .from("group_members")
        .select("role")
        .eq("group_id", group_id)
        .maybeSingle();
      if (error) throw new Error(`getGroupRole: ${error.message}`);
      const role = (data as { role?: string } | null)?.role;
      return role === "owner" || role === "member" ? role : null;
    },
  };
}
