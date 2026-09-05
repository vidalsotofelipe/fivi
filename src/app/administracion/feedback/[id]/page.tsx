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
import { dateTime, feedbackStatusLabel, feedbackTypeLabel } from "@/lib/adminFormat";
import { FEEDBACK_STATUSES, type FeedbackStatus } from "@/lib/feedbackShared";

interface FeedbackDetail {
  id: string;
  type: string;
  title: string;
  description: string;
  contact_email: string | null;
  steps_to_reproduce: string | null;
  expected_behavior: string | null;
  status: string;
  screenshot_url: string | null;
  app_version: string | null;
  environment: string | null;
  language: string | null;
  theme: string | null;
  browser: string | null;
  operating_system: string | null;
  device_type: string | null;
  viewport: string | null;
  page_path: string | null;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
}

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
    default:
      return "neutral";
  }
}

export default function AdminFeedbackDetailPage() {
  const id = String(useParams().id ?? "");
  const { data, error, loading, reload } = useApi<FeedbackDetail>(`/api/admin/feedback/${id}`);
  const [pendingStatus, setPendingStatus] = useState<FeedbackStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function applyStatus(status: FeedbackStatus) {
    setBusy(true);
    setActionError(null);
    try {
      await adminFetch(`/api/admin/feedback/${id}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      setPendingStatus(null);
      reload();
    } catch (e) {
      setActionError(e instanceof AdminApiError || e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Feedback"
        description={id}
        actions={
          <Link href="/administracion/feedback" className="text-sm text-accent-strong">
            ← Volver
          </Link>
        }
      />

      {loading ? (
        <DetailSkeleton />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <EmptyState title="No encontrado" description="Este feedback no existe o fue eliminado." />
      ) : (
        <div className="space-y-4">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h1 className="font-display text-xl font-bold">{data.title}</h1>
              <div className="flex items-center gap-2">
                <Badge tone="neutral">{feedbackTypeLabel(data.type)}</Badge>
                <Badge tone={statusTone(data.status)}>{feedbackStatusLabel(data.status)}</Badge>
              </div>
            </div>
            <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="label-caps">Enviado</dt>
                <dd className="text-muted">{dateTime(data.created_at)}</dd>
              </div>
              <div>
                <dt className="label-caps">Actualizado</dt>
                <dd className="text-muted">{dateTime(data.updated_at)}</dd>
              </div>
              {data.contact_email ? (
                <div>
                  <dt className="label-caps">Contacto</dt>
                  <dd className="text-muted">{data.contact_email}</dd>
                </div>
              ) : null}
            </dl>
          </Card>

          <Card title="Descripción">
            <p className="whitespace-pre-wrap text-sm text-text">{data.description}</p>
          </Card>

          {data.steps_to_reproduce || data.expected_behavior ? (
            <Card title="Detalle del problema">
              {data.steps_to_reproduce ? (
                <div className="mb-3">
                  <p className="label-caps">Qué estaba intentando hacer</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-text">
                    {data.steps_to_reproduce}
                  </p>
                </div>
              ) : null}
              {data.expected_behavior ? (
                <div>
                  <p className="label-caps">Qué esperaba que ocurriera</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-text">
                    {data.expected_behavior}
                  </p>
                </div>
              ) : null}
            </Card>
          ) : null}

          {data.screenshot_url ? (
            <Card title="Captura">
              {/* eslint-disable-next-line @next/next/no-img-element -- signed URL de corta vida, no vale la pena next/image */}
              <img
                src={data.screenshot_url}
                alt="Captura adjunta al feedback"
                className="h-auto max-w-full border border-border"
              />
            </Card>
          ) : null}

          <Card title="Cambiar estado">
            {actionError ? (
              <p className="mb-2 text-sm text-danger" role="alert">
                {actionError}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {FEEDBACK_STATUSES.map((s) => (
                <Button
                  key={s}
                  variant={s === data.status ? "primary" : "ghost"}
                  disabled={busy || s === data.status}
                  onClick={() => (s === "discarded" ? setPendingStatus(s) : void applyStatus(s))}
                >
                  {feedbackStatusLabel(s)}
                </Button>
              ))}
            </div>
          </Card>

          <details className="border border-border bg-surface p-4">
            <summary className="label-caps cursor-pointer">Metadata técnica</summary>
            <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <Meta label="Versión de fivi" value={data.app_version} />
              <Meta label="Entorno" value={data.environment} />
              <Meta label="Idioma" value={data.language} />
              <Meta label="Tema" value={data.theme} />
              <Meta label="Navegador" value={data.browser} />
              <Meta label="Sistema operativo" value={data.operating_system} />
              <Meta label="Dispositivo" value={data.device_type} />
              <Meta label="Viewport" value={data.viewport} />
              <Meta label="Página de origen" value={data.page_path} />
            </dl>
            {data.user_agent ? (
              <div className="mt-3 border-t border-border pt-2">
                <p className="label-caps">User-Agent</p>
                <p className="mt-1 break-all text-xs text-muted">{data.user_agent}</p>
              </div>
            ) : null}
          </details>
        </div>
      )}

      <ConfirmDialog
        open={pendingStatus === "discarded"}
        title="Descartar este feedback"
        danger
        busy={busy}
        confirmLabel="Descartar"
        onConfirm={() => void applyStatus("discarded")}
        onCancel={() => setPendingStatus(null)}
      >
        <p>Se marca como descartado. Podés volver a cambiarle el estado después.</p>
      </ConfirmDialog>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="label-caps">{label}</dt>
      <dd className="text-muted">{value ?? "—"}</dd>
    </div>
  );
}
