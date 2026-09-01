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
import { dateTime, money } from "@/lib/adminFormat";

interface GroupRow {
  id: string;
  name: string;
  currency_code: string;
  created_at: string;
  archived_at: string | null;
  participant_count: number;
  expense_count: number;
  payment_count: number;
  expense_total_minor: number;
  member_count: number;
}
interface GroupsResp {
  total: number;
  limit: number;
  offset: number;
  rows: GroupRow[];
}

const SORTS: { col: string; label: string }[] = [
  { col: "created_at", label: "Creado" },
  { col: "name", label: "Nombre" },
  { col: "participant_count", label: "Personas" },
  { col: "expense_count", label: "Gastos" },
];

export default function AdminGruposPage() {
  const lp = useListParams({ sort: "created_at" });
  const { data, error, loading, reload } = useApi<GroupsResp>(`/api/admin/groups?${lp.query}`);

  return (
    <div>
      <PageHeader title="Grupos" description="Consulta paginada de los grupos (sólo lectura)." />

      <div className="mb-3 flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="label-caps">Buscar</span>
          <input
            value={lp.search}
            onChange={(e) => lp.setSearch(e.target.value)}
            placeholder="nombre"
            className="mt-1 block w-56 border border-border-strong bg-bg px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="label-caps">Moneda</span>
          <input
            value={lp.filters.currency ?? ""}
            onChange={(e) => lp.setFilter("currency", e.target.value.toUpperCase().slice(0, 3))}
            placeholder="ARS"
            className="mt-1 block w-20 border border-border-strong bg-bg px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="label-caps">Archivo</span>
          <select
            value={lp.filters.archived ?? ""}
            onChange={(e) => lp.setFilter("archived", e.target.value)}
            className="mt-1 block border border-border-strong bg-bg px-2 py-2 text-sm"
          >
            <option value="">Todos</option>
            <option value="no">Activos</option>
            <option value="yes">Archivados</option>
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
        <EmptyState title="Sin resultados" description="Ningún grupo coincide con los filtros." />
      ) : (
        <>
          <TableWrap>
            <thead>
              <tr>
                {SORTS.map((s) => (
                  <Th key={s.col}>
                    <button type="button" onClick={() => lp.setSort(s.col)} className="label-caps hover:text-text">
                      {s.label}
                      {lp.sort === s.col ? (lp.dir === "asc" ? " ▲" : " ▼") : ""}
                    </button>
                  </Th>
                ))}
                <Th>Moneda</Th>
                <Th className="text-right">Gastos (total)</Th>
                <Th>Pagos</Th>
                <Th>Miembros</Th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((g) => (
                <tr key={g.id} className="hover:bg-surface-raised">
                  <Td className="whitespace-nowrap text-muted">{dateTime(g.created_at)}</Td>
                  <Td>
                    <Link href={`/admin/grupos/${g.id}`} className="font-semibold text-accent-strong">
                      {g.name}
                    </Link>
                    {g.archived_at ? <Badge tone="warm">archivado</Badge> : null}
                  </Td>
                  <Td className="tabular-nums">{g.participant_count}</Td>
                  <Td className="tabular-nums">{g.expense_count}</Td>
                  <Td className="label-caps">{g.currency_code}</Td>
                  <Td className="whitespace-nowrap text-right tabular-nums">
                    {money(g.expense_total_minor, g.currency_code)}
                  </Td>
                  <Td className="tabular-nums">{g.payment_count}</Td>
                  <Td className="tabular-nums">{g.member_count}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <Pagination total={data.total} limit={data.limit} offset={data.offset} onPage={lp.setOffset} />
        </>
      )}
    </div>
  );
}
