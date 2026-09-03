"use client";

import { useApi } from "@/components/admin/useApi";
import { Badge, Button, Card, ErrorState, PageHeader, Skeleton } from "@/components/admin/ui";
import { dateTime, envLabel, getAdminTimeZone } from "@/lib/adminFormat";

interface Check {
  ok: boolean;
  ms: number;
  error?: string;
}
interface Status {
  app: { version: string; commit: string; environment: string };
  checks: { database: Check; supabase_auth: Check };
  supabase_host: string | null;
  checked_at: string;
}

function CheckRow({ label, check }: { label: string; check: Check }) {
  return (
    <li className="flex items-center justify-between gap-2 py-2">
      <span>{label}</span>
      <span className="flex items-center gap-2 text-sm text-muted">
        <span className="tabular-nums">{check.ms} ms</span>
        <Badge tone={check.ok ? "positive" : "danger"}>{check.ok ? "OK" : "falla"}</Badge>
      </span>
      {check.error ? <span className="w-full text-xs text-danger">{check.error}</span> : null}
    </li>
  );
}

export default function AdminEstadoPage() {
  const { data, error, loading, reload } = useApi<Status>("/api/admin/status");

  return (
    <div>
      <PageHeader
        title="Estado"
        description="Diagnóstico seguro (sin variables de entorno ni secretos)."
        actions={
          <Button variant="ghost" onClick={reload}>
            Actualizar
          </Button>
        }
      />

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? null : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card title="Aplicación">
            <dl className="space-y-2">
              <div className="flex justify-between">
                <dt className="label-caps">Versión</dt>
                <dd className="font-display font-bold">v{data.app.version}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="label-caps">Commit</dt>
                <dd className="font-mono text-sm">{data.app.commit}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="label-caps">Entorno</dt>
                <dd>{envLabel(data.app.environment)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="label-caps">Supabase</dt>
                <dd className="text-sm text-muted">{data.supabase_host ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="label-caps">Zona horaria</dt>
                <dd className="text-sm text-muted">{getAdminTimeZone()}</dd>
              </div>
            </dl>
          </Card>

          <Card title="Chequeos">
            <ul className="divide-y divide-border">
              <CheckRow label="Base de datos" check={data.checks.database} />
              <CheckRow label="Supabase Auth" check={data.checks.supabase_auth} />
            </ul>
            <p className="mt-3 text-xs text-muted">Consultado {dateTime(data.checked_at)}</p>
          </Card>
        </div>
      )}
    </div>
  );
}
