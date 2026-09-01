"use client";

import Link from "next/link";
import { useState } from "react";
import { useApi } from "@/components/admin/useApi";
import { BarChart } from "@/components/admin/Chart";
import {
  Card,
  EmptyState,
  ErrorState,
  Kpi,
  PageHeader,
  Skeleton,
} from "@/components/admin/ui";
import { dateTime as dt, money } from "@/lib/adminFormat";

interface Metrics {
  range: { from: string; to: string };
  users: {
    total: number;
    anonymous: number;
    with_email: number;
    new_in_range: number;
    new_prev: number;
    new_7d: number;
    new_30d: number;
  };
  groups: { total: number; archived: number; new_in_range: number; new_prev: number };
  movements: {
    total: number;
    in_range: number;
    prev: number;
    this_month: number;
    last_at: string | null;
    by_type: { type: string; count: number }[];
  };
  volume_in_range: { currency: string; total_minor: number; count: number }[];
  volume_this_month: { currency: string; total_minor: number }[];
  monthly: { month: string; movements: number; new_groups: number; new_users: number }[];
  recent_users: { id: string; created_at: string; is_anonymous: boolean; email: string | null }[];
  recent_activity: { type: string; currency: string; amount_minor: number; created_at: string }[];
}

const PERIODS = [7, 30, 90] as const;

export default function AdminDashboardPage() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>(30);
  const { data, error, loading, reload } = useApi<Metrics>(`/api/admin/metrics?period=${period}`);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Datos reales de la operación de FIVI."
        actions={
          <div className="flex border border-border" role="group" aria-label="Período">
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                aria-pressed={period === p}
                className={
                  "px-3 py-1 text-xs font-bold " +
                  (period === p ? "bg-text text-bg" : "text-muted hover:bg-surface-raised")
                }
              >
                {p}d
              </button>
            ))}
          </div>
        }
      />

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <EmptyState title="Sin datos" />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              label="Usuarios"
              value={data.users.total}
              hint={`${data.users.with_email} con email · ${data.users.anonymous} anónimos`}
            />
            <Kpi
              label={`Altas (${period}d)`}
              value={data.users.new_in_range}
              hint="vs. período previo"
              delta={data.users.new_in_range - data.users.new_prev}
            />
            <Kpi label="Nuevos 7 días" value={data.users.new_7d} hint={`${data.users.new_30d} en 30 días`} />
            <Kpi
              label="Grupos activos"
              value={data.groups.total}
              hint={`${data.groups.archived} archivados`}
            />
            <Kpi label="Movimientos totales" value={data.movements.total} />
            <Kpi
              label={`Movimientos (${period}d)`}
              value={data.movements.in_range}
              delta={data.movements.in_range - data.movements.prev}
            />
            <Kpi label="Movimientos este mes" value={data.movements.this_month} />
            <Kpi label="Último movimiento" value={<span className="text-base">{dt(data.movements.last_at)}</span>} />
          </div>

          <Card title="Evolución mensual (12 meses)">
            {data.monthly.length === 0 ? (
              <p className="text-sm text-muted">Sin actividad registrada.</p>
            ) : (
              <BarChart
                data={data.monthly.map((m) => ({
                  label: m.month.slice(5),
                  value: m.movements,
                  value2: m.new_users,
                }))}
                caption="Barra llena: movimientos · sombra: altas de usuarios"
              />
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title={`Volumen del período (${period}d)`}>
              {data.volume_in_range.length === 0 ? (
                <p className="text-sm text-muted">Sin movimientos en el período.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {data.volume_in_range.map((v) => (
                    <li key={v.currency} className="flex items-baseline justify-between py-2">
                      <span className="label-caps">{v.currency}</span>
                      <span className="font-display font-bold">{money(v.total_minor, v.currency)}</span>
                      <span className="text-xs text-muted">{v.count} mov.</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Distribución por tipo">
              {data.movements.by_type.length === 0 ? (
                <p className="text-sm text-muted">Sin datos.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {data.movements.by_type.map((t) => (
                    <li key={t.type} className="flex items-baseline justify-between py-2">
                      <span>{t.type === "expense" ? "Gastos" : "Pagos"}</span>
                      <span className="font-display font-bold">{t.count}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs text-muted">
                El modelo no tiene categorías: la distribución es gasto vs. pago.
              </p>
            </Card>

            <Card title="Últimos usuarios">
              {data.recent_users.length === 0 ? (
                <p className="text-sm text-muted">Sin usuarios.</p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {data.recent_users.map((u) => (
                    <li key={u.id} className="flex items-center justify-between gap-2 py-2">
                      <span className="truncate">{u.email ?? (u.is_anonymous ? "(anónimo)" : u.id.slice(0, 8))}</span>
                      <span className="shrink-0 text-xs text-muted">{dt(u.created_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Actividad reciente">
              {data.recent_activity.length === 0 ? (
                <p className="text-sm text-muted">Sin actividad.</p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {data.recent_activity.map((a, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 py-2">
                      <span>{a.type === "expense" ? "Gasto" : "Pago"}</span>
                      <span className="font-display font-bold">{money(a.amount_minor, a.currency)}</span>
                      <span className="shrink-0 text-xs text-muted">{dt(a.created_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card title="Accesos rápidos">
            <div className="flex flex-wrap gap-2 text-sm">
              {([
                ["/admin/usuarios", "Usuarios"],
                ["/admin/grupos", "Grupos"],
                ["/admin/movimientos", "Movimientos"],
                ["/admin/auditoria", "Auditoría"],
                ["/admin/estado", "Estado"],
              ] as const).map(([href, label]) => (
                <Link
                  key={href}
                  href={href}
                  className="border border-border-strong px-3 py-2 font-semibold hover:bg-surface-raised"
                >
                  {label} →
                </Link>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
