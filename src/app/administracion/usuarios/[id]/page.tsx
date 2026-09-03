"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { adminFetch, AdminApiError } from "@/lib/adminFetch";
import { useApi } from "@/components/admin/useApi";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import {
  Badge,
  Button,
  Card,
  DetailSkeleton,
  EmptyState,
  ErrorState,
  PageHeader,
} from "@/components/admin/ui";
import { dateTime, roleLabel } from "@/lib/adminFormat";

interface UserDetail {
  user: {
    id: string;
    email: string | null;
    is_anonymous: boolean;
    created_at: string;
    last_sign_in_at: string | null;
    banned_until: string | null;
    is_admin: boolean;
  };
  groups_created: number;
  groups: {
    id: string;
    name: string;
    currency_code: string;
    role: string;
    created_at: string;
    archived_at: string | null;
  }[];
}

type Action = "ban" | "unban" | "grant" | "revoke" | null;

export default function AdminUserDetailPage() {
  const id = String(useParams().id ?? "");
  const { data, error, loading, reload } = useApi<UserDetail>(`/api/admin/users/${id}`);
  const [action, setAction] = useState<Action>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const banned =
    data?.user.banned_until != null && new Date(data.user.banned_until).getTime() > Date.now();

  async function run() {
    if (!action) return;
    setBusy(true);
    setActionError(null);
    try {
      if (action === "ban" || action === "unban") {
        await adminFetch(`/api/admin/users/${id}/ban`, {
          method: "POST",
          body: JSON.stringify({ ban: action === "ban" }),
        });
      } else {
        await adminFetch(`/api/admin/users/${id}/admin`, {
          method: "POST",
          body: JSON.stringify({ make: action === "grant" }),
        });
      }
      setAction(null);
      reload();
    } catch (e) {
      setActionError(
        e instanceof AdminApiError ? e.message : e instanceof Error ? e.message : "Error inesperado",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Usuario"
        description={id}
        actions={
          <Link href="/administracion/usuarios" className="text-sm text-accent-strong">
            ← Volver
          </Link>
        }
      />

      {loading ? (
        <DetailSkeleton label="Cargando usuario…" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <EmptyState title="No encontrado" description="El usuario no existe." />
      ) : (
        <div className="space-y-6">
          <Card>
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              <div>
                <dt className="label-caps">Email</dt>
                <dd>{data.user.email ?? (data.user.is_anonymous ? "(anónimo)" : "(sin email)")}</dd>
              </div>
              <div>
                <dt className="label-caps">Estado</dt>
                <dd className="flex gap-1">
                  {data.user.is_admin ? <Badge tone="accent">admin</Badge> : null}
                  {banned ? <Badge tone="danger">desactivado</Badge> : <Badge tone="positive">activo</Badge>}
                </dd>
              </div>
              <div>
                <dt className="label-caps">Alta</dt>
                <dd>{dateTime(data.user.created_at)}</dd>
              </div>
              <div>
                <dt className="label-caps">Último acceso</dt>
                <dd>{dateTime(data.user.last_sign_in_at)}</dd>
              </div>
              <div>
                <dt className="label-caps">Grupos creados</dt>
                <dd>{data.groups_created}</dd>
              </div>
            </dl>

            <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
              {banned ? (
                <Button variant="ghost" onClick={() => setAction("unban")}>
                  Reactivar usuario
                </Button>
              ) : (
                <Button variant="danger" onClick={() => setAction("ban")}>
                  Desactivar usuario
                </Button>
              )}
              {data.user.is_admin ? (
                <Button variant="ghost" onClick={() => setAction("revoke")}>
                  Quitar rol admin
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => setAction("grant")}>
                  Conceder rol admin
                </Button>
              )}
            </div>
            {actionError ? (
              <p className="mt-3 border border-danger bg-surface p-2 text-sm text-danger" role="alert">
                {actionError}
              </p>
            ) : null}
          </Card>

          <Card title={`Grupos (${data.groups.length})`}>
            {data.groups.length === 0 ? (
              <p className="text-sm text-muted">No pertenece a ningún grupo.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {data.groups.map((g) => (
                  <li key={g.id} className="flex items-center justify-between gap-2 py-2">
                    <Link href={`/administracion/grupos/${g.id}`} className="font-semibold text-accent-strong">
                      {g.name}
                    </Link>
                    <span className="text-xs text-muted">
                      {roleLabel(g.role)} · {g.currency_code}
                      {g.archived_at ? " · archivado" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={action !== null}
        title={
          action === "ban"
            ? "Desactivar usuario"
            : action === "unban"
              ? "Reactivar usuario"
              : action === "grant"
                ? "Conceder rol de administrador"
                : "Quitar rol de administrador"
        }
        confirmLabel={action === "ban" ? "Desactivar" : action === "unban" ? "Reactivar" : "Confirmar"}
        danger={action === "ban" || action === "revoke"}
        busy={busy}
        onCancel={() => setAction(null)}
        onConfirm={run}
      >
        {action === "ban" ? (
          <>El usuario no podrá volver a iniciar sesión. Sus datos y saldos se conservan.</>
        ) : action === "unban" ? (
          <>El usuario podrá volver a iniciar sesión.</>
        ) : action === "grant" ? (
          <>Podrá acceder al panel de administración y a todos los datos de todos los grupos.</>
        ) : (
          <>Perderá el acceso al panel. No se puede quitar el último administrador.</>
        )}
      </ConfirmDialog>
    </div>
  );
}
