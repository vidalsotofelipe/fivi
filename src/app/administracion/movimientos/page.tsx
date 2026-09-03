"use client";

import Link from "next/link";
import { useState } from "react";
import { adminFetchRaw, AdminApiError } from "@/lib/adminFetch";
import { useApi } from "@/components/admin/useApi";
import { useListParams } from "@/components/admin/useListParams";
import {
  Badge,
  Button,
  DateRangeFields,
  dateRangeError,
  EmptyState,
  ErrorState,
  Pagination,
  PageHeader,
  SkeletonRows,
  TableWrap,
  Td,
  Th,
} from "@/components/admin/ui";
import { date, dateTime, money } from "@/lib/adminFormat";

interface MovRow {
  type: "expense" | "payment";
  id: string;
  group_id: string;
  group_name: string;
  currency: string;
  amount_minor: number;
  description: string | null;
  occurred_on: string;
  created_at: string;
}
interface MovResp {
  total: number;
  limit: number;
  offset: number;
  rows: MovRow[];
}

const SORTS: { col: string; label: string }[] = [
  { col: "created_at", label: "Registrado" },
  { col: "occurred_on", label: "Fecha" },
  { col: "amount_minor", label: "Monto" },
];

export default function AdminMovimientosPage() {
  const lp = useListParams({ sort: "created_at" });
  const rangeErr = dateRangeError(lp.filters.from, lp.filters.to);
  // Con el rango inválido no se consulta (path = null): se corrige antes.
  const { data, error, loading, reload } = useApi<MovResp>(
    rangeErr ? null : `/api/admin/movimientos?${lp.query}`,
  );
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function exportCsv() {
    setExporting(true);
    setExportError(null);
    try {
      const res = await adminFetchRaw(`/api/admin/movimientos/export?${lp.query}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ??
        "fivi-movimientos.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(e instanceof AdminApiError || e instanceof Error ? e.message : "Error al exportar");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Movimientos"
        description="Gastos y pagos de todos los grupos (sólo lectura)."
        actions={
          <Button
            variant="ghost"
            onClick={exportCsv}
            disabled={exporting || !!rangeErr || !data || data.total === 0}
          >
            {exporting ? "Exportando…" : "Exportar CSV"}
          </Button>
        }
      />

      <div className="mb-3 flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="label-caps">Buscar</span>
          <input
            value={lp.search}
            onChange={(e) => lp.setSearch(e.target.value)}
            placeholder="descripción o grupo"
            className="mt-1 block w-56 border border-border-strong bg-bg px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="label-caps">Tipo</span>
          <select
            value={lp.filters.type ?? ""}
            onChange={(e) => lp.setFilter("type", e.target.value)}
            className="mt-1 block border border-border-strong bg-bg px-2 py-2 text-sm"
          >
            <option value="">Todos</option>
            <option value="expense">Gastos</option>
            <option value="payment">Pagos</option>
          </select>
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
        <DateRangeFields
          from={lp.filters.from}
          to={lp.filters.to}
          onFrom={(v) => lp.setFilter("from", v)}
          onTo={(v) => lp.setFilter("to", v)}
        />
        <button
          type="button"
          onClick={lp.reset}
          className="min-h-touch border border-border px-3 text-sm text-muted hover:bg-surface-raised"
        >
          Limpiar
        </button>
      </div>

      {rangeErr ? (
        <p className="mb-3 border border-danger bg-surface p-2 text-sm text-danger" role="alert">
          {rangeErr}
        </p>
      ) : null}
      {exportError ? (
        <p className="mb-3 border border-danger bg-surface p-2 text-sm text-danger" role="alert">
          {exportError}
        </p>
      ) : null}

      {rangeErr ? (
        <EmptyState
          title="Rango de fechas inválido"
          description="Corregí el rango para ver los movimientos."
        />
      ) : loading ? (
        <SkeletonRows rows={10} cols={5} />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data || data.rows.length === 0 ? (
        <EmptyState title="Sin resultados" description="Ningún movimiento coincide con los filtros." />
      ) : (
        <>
          <TableWrap>
            <thead>
              <tr>
                <Th>Tipo</Th>
                {SORTS.map((s) => (
                  <Th key={s.col} className={s.col === "amount_minor" ? "text-right" : undefined}>
                    <button type="button" onClick={() => lp.setSort(s.col)} className="label-caps hover:text-text">
                      {s.label}
                      {lp.sort === s.col ? (lp.dir === "asc" ? " ▲" : " ▼") : ""}
                    </button>
                  </Th>
                ))}
                <Th>Grupo</Th>
                <Th>Descripción</Th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((m) => (
                <tr key={`${m.type}-${m.id}`} className="hover:bg-surface-raised">
                  <Td>
                    <Badge tone={m.type === "expense" ? "accent" : "positive"}>
                      {m.type === "expense" ? "gasto" : "pago"}
                    </Badge>
                  </Td>
                  <Td className="whitespace-nowrap text-muted">{dateTime(m.created_at)}</Td>
                  <Td className="whitespace-nowrap text-muted">{date(m.occurred_on)}</Td>
                  <Td className="whitespace-nowrap text-right tabular-nums">
                    {money(m.amount_minor, m.currency)}
                  </Td>
                  <Td>
                    <Link href={`/administracion/grupos/${m.group_id}`} className="text-accent-strong">
                      {m.group_name}
                    </Link>
                  </Td>
                  <Td className="max-w-xs truncate text-muted">{m.description ?? "—"}</Td>
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
