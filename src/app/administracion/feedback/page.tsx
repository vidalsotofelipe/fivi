"use client";

import Link from "next/link";
import { useApi } from "@/components/admin/useApi";
import { useListParams } from "@/components/admin/useListParams";
import {
  Badge,
  DateRangeFields,
  dateRangeError,
  EmptyState,
  ErrorState,
  Kpi,
  Pagination,
  PageHeader,
  SkeletonRows,
  TableWrap,
  Td,
  Th,
} from "@/components/admin/ui";
import { dateTime, feedbackStatusLabel, feedbackTypeLabel } from "@/lib/adminFormat";
import { FEEDBACK_STATUSES, FEEDBACK_TYPES } from "@/lib/feedbackShared";

interface FeedbackRow {
  id: string;
  type: string;
  title: string;
  description: string;
  status: string;
  contact_email: string | null;
  app_version: string | null;
  environment: string | null;
  created_at: string;
  updated_at: string;
  has_screenshot: boolean;
}
interface FeedbackResp {
  total: number;
  limit: number;
  offset: number;
  counts: {
    total: number;
    new: number;
    reviewing: number;
    planned: number;
    resolved: number;
    discarded: number;
  };
  rows: FeedbackRow[];
}

const SORTS: { col: string; label: string }[] = [
  { col: "created_at", label: "Fecha" },
  { col: "type", label: "Tipo" },
  { col: "status", label: "Estado" },
];

function statusTone(status: string): "neutral" | "accent" | "warm" | "positive" | "danger" {
  switch (status) {
    case "new":
      return "accent";
    case "reviewing":
      return "warm";
    case "planned":
      return "accent";
    case "resolved":
      return "positive";
    case "discarded":
      return "neutral";
    default:
      return "neutral";
  }
}

export default function AdminFeedbackPage() {
  const lp = useListParams({ sort: "created_at" });
  const rangeErr = dateRangeError(lp.filters.from, lp.filters.to);
  const { data, error, loading, reload } = useApi<FeedbackResp>(
    rangeErr ? null : `/api/admin/feedback?${lp.query}`,
  );

  const counts = data?.counts;

  return (
    <div>
      <PageHeader
        title="Feedback"
        description="Problemas, sugerencias, consultas y comentarios enviados desde la app."
      />

      {counts ? (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Kpi label="Total" value={counts.total} />
          <Kpi label="Nuevos" value={counts.new} />
          <Kpi label="Revisando" value={counts.reviewing} />
          <Kpi label="Planificados" value={counts.planned} />
          <Kpi label="Resueltos" value={counts.resolved} />
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="label-caps">Buscar</span>
          <input
            value={lp.search}
            onChange={(e) => lp.setSearch(e.target.value)}
            placeholder="título o descripción"
            className="mt-1 block w-56 border border-border-strong bg-bg px-3 py-2 text-sm"
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
            {FEEDBACK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {feedbackStatusLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label-caps">Tipo</span>
          <select
            value={lp.filters.type ?? ""}
            onChange={(e) => lp.setFilter("type", e.target.value)}
            className="mt-1 block border border-border-strong bg-bg px-2 py-2 text-sm"
          >
            <option value="">Todos</option>
            {FEEDBACK_TYPES.map((t) => (
              <option key={t} value={t}>
                {feedbackTypeLabel(t)}
              </option>
            ))}
          </select>
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

      {rangeErr ? (
        <EmptyState
          title="Rango de fechas inválido"
          description="Corregí el rango para ver el feedback."
        />
      ) : loading ? (
        <SkeletonRows rows={10} cols={5} />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data || data.rows.length === 0 ? (
        <EmptyState title="Sin resultados" description="Ningún feedback coincide con los filtros." />
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
                <Th>Título</Th>
                <Th>Estado</Th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((f) => (
                <tr key={f.id} className="hover:bg-surface-raised">
                  <Td className="whitespace-nowrap text-muted">{dateTime(f.created_at)}</Td>
                  <Td className="whitespace-nowrap">{feedbackTypeLabel(f.type)}</Td>
                  <Td className="max-w-sm">
                    <Link
                      href={`/administracion/feedback/${f.id}`}
                      className="font-semibold text-accent-strong hover:underline"
                    >
                      {f.title}
                    </Link>
                    <p className="mt-0.5 max-w-sm truncate text-xs text-muted">{f.description}</p>
                  </Td>
                  <Td>
                    <Badge tone={statusTone(f.status)}>{feedbackStatusLabel(f.status)}</Badge>
                  </Td>
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
