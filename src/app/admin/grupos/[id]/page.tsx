"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useApi } from "@/components/admin/useApi";
import { Badge, Card, EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/admin/ui";
import { dateTime, money, shortId } from "@/lib/adminFormat";

interface GroupDetail {
  group: {
    id: string;
    name: string;
    description: string | null;
    currency_code: string;
    created_at: string;
    updated_at: string;
    archived_at: string | null;
    created_by: string | null;
  };
  participants: { id: string; name: string; created_at: string }[];
  members: { user_id: string; role: string }[];
  expenses: { count: number; total_minor: number };
  payments: { count: number; total_minor: number };
}

export default function AdminGroupDetailPage() {
  const id = String(useParams().id ?? "");
  const { data, error, loading, reload } = useApi<GroupDetail>(`/api/admin/groups/${id}`);
  const c = data?.group.currency_code ?? "";

  return (
    <div>
      <PageHeader
        title="Grupo"
        description={id}
        actions={
          <Link href="/admin/grupos" className="text-sm text-accent-strong">
            ← Volver
          </Link>
        }
      />

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-40" />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <EmptyState title="No encontrado" />
      ) : (
        <div className="space-y-6">
          <Card>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-lg font-bold">{data.group.name}</h2>
              {data.group.archived_at ? <Badge tone="warm">archivado</Badge> : null}
            </div>
            {data.group.description ? (
              <p className="mt-1 text-sm text-muted">{data.group.description}</p>
            ) : null}
            <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
              <div>
                <dt className="label-caps">Moneda</dt>
                <dd>{data.group.currency_code}</dd>
              </div>
              <div>
                <dt className="label-caps">Creado</dt>
                <dd>{dateTime(data.group.created_at)}</dd>
              </div>
              <div>
                <dt className="label-caps">Actualizado</dt>
                <dd>{dateTime(data.group.updated_at)}</dd>
              </div>
              <div>
                <dt className="label-caps">Creado por</dt>
                <dd>
                  {data.group.created_by ? (
                    <Link
                      href={`/admin/usuarios/${data.group.created_by}`}
                      className="font-mono text-xs text-accent-strong"
                    >
                      {shortId(data.group.created_by)}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
            </dl>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card title="Gastos">
              <p className="font-display text-2xl font-bold">{data.expenses.count}</p>
              <p className="text-sm text-muted">{money(data.expenses.total_minor, c)}</p>
            </Card>
            <Card title="Pagos">
              <p className="font-display text-2xl font-bold">{data.payments.count}</p>
              <p className="text-sm text-muted">{money(data.payments.total_minor, c)}</p>
            </Card>
          </div>

          <Card title={`Participantes (${data.participants.length})`}>
            {data.participants.length === 0 ? (
              <p className="text-sm text-muted">Sin participantes.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {data.participants.map((p) => (
                  <li key={p.id} className="flex justify-between py-2">
                    <span>{p.name}</span>
                    <span className="text-xs text-muted">{dateTime(p.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={`Miembros con cuenta (${data.members.length})`}>
            {data.members.length === 0 ? (
              <p className="text-sm text-muted">Ningún miembro sincronizado (grupo sólo local).</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {data.members.map((m) => (
                  <li key={m.user_id} className="flex justify-between py-2">
                    <Link
                      href={`/admin/usuarios/${m.user_id}`}
                      className="font-mono text-xs text-accent-strong"
                    >
                      {shortId(m.user_id)}
                    </Link>
                    <Badge tone={m.role === "owner" ? "accent" : "neutral"}>{m.role}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
