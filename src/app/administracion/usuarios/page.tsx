"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { USER_COLUMNS_META, type UserColumnKey } from "./columns";
import { useApi } from "@/components/admin/useApi";
import { useListParams } from "@/components/admin/useListParams";
import {
  Badge,
  EmptyState,
  ErrorState,
  Pagination,
  PageHeader,
  SkeletonRows,
  TableWrap,
  Td,
  Th,
} from "@/components/admin/ui";
import { dateTime, shortId } from "@/lib/adminFormat";

interface UserRow {
  id: string;
  email: string | null;
  is_anonymous: boolean;
  created_at: string;
  last_sign_in_at: string | null;
  banned_until: string | null;
  is_admin: boolean;
  groups_owned: number;
  groups_member: number;
}
interface UsersResp {
  total: number;
  limit: number;
  offset: number;
  rows: UserRow[];
}

function isBanned(u: UserRow): boolean {
  return u.banned_until != null && new Date(u.banned_until).getTime() > Date.now();
}

/**
 * Renderizado de cada celda por clave. La ESTRUCTURA (orden, etiquetas) vive en
 * `./columns` (sin JSX, testeable); acá sólo el contenido. Encabezados y celdas
 * recorren `USER_COLUMNS_META` en el mismo orden, así no pueden desalinearse.
 */
const CELLS: Record<UserColumnKey, (u: UserRow) => ReactNode> = {
  email: (u) => (
    <Link
      href={`/administracion/usuarios/${u.id}`}
      className="font-semibold text-accent-strong"
    >
      {u.email ?? (u.is_anonymous ? "(anónimo)" : "(sin email)")}
    </Link>
  ),
  created_at: (u) => dateTime(u.created_at),
  last_sign_in_at: (u) => dateTime(u.last_sign_in_at),
  status: (u) => (
    <div className="flex flex-wrap gap-1">
      {u.is_admin ? <Badge tone="accent">admin</Badge> : null}
      {isBanned(u) ? (
        <Badge tone="danger">desactivado</Badge>
      ) : (
        <Badge tone="positive">activo</Badge>
      )}
    </div>
  ),
  groups: (u) => `${u.groups_owned} propios · ${u.groups_member} miembro`,
  id: (u) => shortId(u.id),
};

export default function AdminUsuariosPage() {
  const lp = useListParams({ sort: "created_at" });
  const { data, error, loading, reload } = useApi<UsersResp>(`/api/admin/users?${lp.query}`);

  return (
    <div>
      <PageHeader title="Usuarios" description="Consulta y gestión de usuarios de FIVI." />

      <div className="mb-3 flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="label-caps">Buscar</span>
          <input
            value={lp.search}
            onChange={(e) => lp.setSearch(e.target.value)}
            placeholder="email o id"
            className="mt-1 block w-64 border border-border-strong bg-bg px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="label-caps">Estado</span>
          <select
            value={lp.filters.status ?? ""}
            onChange={(e) => lp.setFilter("status", e.target.value)}
            className="mt-1 block border border-border-strong bg-bg px-2 py-2 text-sm"
          >
            <option value="">Todos</option>
            <option value="active">Activos</option>
            <option value="banned">Desactivados</option>
          </select>
        </label>
        <label className="block">
          <span className="label-caps">Rol</span>
          <select
            value={lp.filters.role ?? ""}
            onChange={(e) => lp.setFilter("role", e.target.value)}
            className="mt-1 block border border-border-strong bg-bg px-2 py-2 text-sm"
          >
            <option value="">Todos</option>
            <option value="admin">Administradores</option>
            <option value="user">Sin rol admin</option>
          </select>
        </label>
        <button
          type="button"
          onClick={lp.reset}
          className="min-h-touch border border-border px-3 text-sm text-muted hover:bg-surface-raised"
        >
          Limpiar
        </button>
      </div>

      {loading ? (
        <SkeletonRows rows={8} cols={USER_COLUMNS_META.length} />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data || data.rows.length === 0 ? (
        <EmptyState title="Sin resultados" description="Ningún usuario coincide con los filtros." />
      ) : (
        <>
          <TableWrap>
            <thead>
              <tr>
                {USER_COLUMNS_META.map((c) => (
                  <Th key={c.key}>
                    {c.sort ? (
                      <button
                        type="button"
                        onClick={() => lp.setSort(c.sort!)}
                        className="label-caps hover:text-text"
                      >
                        {c.label}
                        {lp.sort === c.sort ? (lp.dir === "asc" ? " ▲" : " ▼") : ""}
                      </button>
                    ) : (
                      c.label
                    )}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((u) => (
                <tr key={u.id} className="hover:bg-surface-raised">
                  {USER_COLUMNS_META.map((c, i) =>
                    i === 0 ? (
                      <Th key={c.key} scope="row" className={c.className}>
                        {CELLS[c.key](u)}
                      </Th>
                    ) : (
                      <Td key={c.key} className={c.className}>
                        {CELLS[c.key](u)}
                      </Td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <Pagination
            total={data.total}
            limit={data.limit}
            offset={data.offset}
            onPage={lp.setOffset}
          />
        </>
      )}
    </div>
  );
}
