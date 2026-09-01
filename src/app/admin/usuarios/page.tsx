"use client";

import Link from "next/link";
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

const SORTS: { col: string; label: string }[] = [
  { col: "created_at", label: "Alta" },
  { col: "last_sign_in_at", label: "Último acceso" },
  { col: "email", label: "Email" },
];

function isBanned(u: UserRow): boolean {
  return u.banned_until != null && new Date(u.banned_until).getTime() > Date.now();
}

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
        <SkeletonRows rows={8} cols={6} />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data || data.rows.length === 0 ? (
        <EmptyState title="Sin resultados" description="Ningún usuario coincide con los filtros." />
      ) : (
        <>
          <TableWrap>
            <thead>
              <tr>
                {SORTS.map((s) => (
                  <Th key={s.col}>
                    <button
                      type="button"
                      onClick={() => lp.setSort(s.col)}
                      className="label-caps hover:text-text"
                    >
                      {s.label}
                      {lp.sort === s.col ? (lp.dir === "asc" ? " ▲" : " ▼") : ""}
                    </button>
                  </Th>
                ))}
                <Th>Estado</Th>
                <Th>Grupos</Th>
                <Th>ID</Th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((u) => (
                <tr key={u.id} className="hover:bg-surface-raised">
                  <Td>
                    <Link href={`/admin/usuarios/${u.id}`} className="font-semibold text-accent-strong">
                      {u.email ?? (u.is_anonymous ? "(anónimo)" : "(sin email)")}
                    </Link>
                  </Td>
                  <Td className="whitespace-nowrap text-muted">{dateTime(u.created_at)}</Td>
                  <Td className="whitespace-nowrap text-muted">{dateTime(u.last_sign_in_at)}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {u.is_admin ? <Badge tone="accent">admin</Badge> : null}
                      {isBanned(u) ? <Badge tone="danger">desactivado</Badge> : <Badge tone="positive">activo</Badge>}
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap text-muted">
                    {u.groups_owned} propios · {u.groups_member} miembro
                  </Td>
                  <Td className="font-mono text-xs text-faint">{shortId(u.id)}</Td>
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
