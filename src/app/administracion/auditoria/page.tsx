"use client";

import { useApi } from "@/components/admin/useApi";
import { useListParams } from "@/components/admin/useListParams";
import {
  Badge,
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
import { dateTime, shortId } from "@/lib/adminFormat";

interface AuditRow {
  id: number;
  admin_user_id: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  result: string;
  metadata: Record<string, unknown>;
  created_at: string;
}
interface AuditResp {
  total: number;
  limit: number;
  offset: number;
  rows: AuditRow[];
}

const ACTIONS = [
  "dashboard.view",
  "user.activate",
  "user.deactivate",
  "admin.grant",
  "admin.revoke",
  "movimientos.export",
  "settings.update",
];

export default function AdminAuditoriaPage() {
  const lp = useListParams({ sort: "created_at", limit: 50 });
  const rangeErr = dateRangeError(lp.filters.from, lp.filters.to);
  const { data, error, loading, reload } = useApi<AuditResp>(
    rangeErr ? null : `/api/admin/audit?${lp.query}`,
  );

  return (
    <div>
      <PageHeader title="Auditoría" description="Acciones administrativas registradas." />

      <div className="mb-3 flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="label-caps">Admin (id)</span>
          <input
            value={lp.filters.admin ?? ""}
            onChange={(e) => lp.setFilter("admin", e.target.value.trim())}
            placeholder="uuid"
            className="mt-1 block w-64 border border-border-strong bg-bg px-3 py-2 font-mono text-xs"
          />
        </label>
        <label className="block">
          <span className="label-caps">Acción</span>
          <select
            value={lp.filters.action ?? ""}
            onChange={(e) => lp.setFilter("action", e.target.value)}
            className="mt-1 block border border-border-strong bg-bg px-2 py-2 text-sm"
          >
            <option value="">Todas</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label-caps">Entidad</span>
          <input
            value={lp.filters.entity ?? ""}
            onChange={(e) => lp.setFilter("entity", e.target.value.trim())}
            placeholder="user, setting…"
            className="mt-1 block w-36 border border-border-strong bg-bg px-3 py-2 text-sm"
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

      {rangeErr ? (
        <EmptyState
          title="Rango de fechas inválido"
          description="Corregí el rango para ver la auditoría."
        />
      ) : loading ? (
        <SkeletonRows rows={10} cols={5} />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data || data.rows.length === 0 ? (
        <EmptyState title="Sin registros" description="No hay acciones que coincidan con los filtros." />
      ) : (
        <>
          <TableWrap>
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th>Admin</Th>
                <Th>Acción</Th>
                <Th>Entidad</Th>
                <Th>Resultado</Th>
                <Th>Detalle</Th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id} className="align-top hover:bg-surface-raised">
                  <Td className="whitespace-nowrap text-muted">{dateTime(r.created_at)}</Td>
                  <Td className="font-mono text-xs text-faint">
                    {r.admin_user_id ? shortId(r.admin_user_id) : "—"}
                  </Td>
                  <Td className="whitespace-nowrap font-semibold">{r.action}</Td>
                  <Td className="whitespace-nowrap text-muted">
                    {r.entity ?? "—"}
                    {r.entity_id ? <span className="block font-mono text-xs text-faint">{shortId(r.entity_id)}</span> : null}
                  </Td>
                  <Td>
                    <Badge
                      tone={r.result === "ok" ? "positive" : r.result === "denied" ? "warm" : "danger"}
                    >
                      {r.result}
                    </Badge>
                  </Td>
                  <Td>
                    {Object.keys(r.metadata ?? {}).length > 0 ? (
                      <details>
                        <summary className="cursor-pointer text-xs text-accent-strong">ver</summary>
                        <pre className="mt-1 max-w-md overflow-x-auto border border-border bg-bg p-2 text-[11px]">
                          {JSON.stringify(r.metadata, null, 2)}
                        </pre>
                      </details>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
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
