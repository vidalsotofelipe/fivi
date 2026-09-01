"use client";

import { useEffect, useState } from "react";
import { adminFetch, AdminApiError } from "@/lib/adminFetch";
import { useApi } from "@/components/admin/useApi";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Button, Card, ErrorState, PageHeader, Skeleton } from "@/components/admin/ui";

interface SettingsResp {
  settings: {
    default_currency?: string;
    feature_flags?: Record<string, boolean>;
  };
  keys: string[];
}

type Pending =
  | { key: "default_currency"; value: string }
  | { key: "feature_flags"; value: Record<string, boolean> }
  | null;

export default function AdminConfiguracionPage() {
  const { data, error, loading, reload } = useApi<SettingsResp>("/api/admin/settings");

  const [currency, setCurrency] = useState("");
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [newFlag, setNewFlag] = useState("");
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (!data) return;
    setCurrency(data.settings.default_currency ?? "");
    setFlags(data.settings.feature_flags ?? {});
  }, [data]);

  async function save() {
    if (!pending) return;
    setBusy(true);
    setMsg(null);
    try {
      await adminFetch("/api/admin/settings", {
        method: "PATCH",
        body: JSON.stringify(pending),
      });
      setPending(null);
      setMsg({ kind: "ok", text: "Cambios guardados." });
      reload();
    } catch (e) {
      setMsg({
        kind: "err",
        text: e instanceof AdminApiError || e instanceof Error ? e.message : "Error al guardar",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Configuración"
        description="Sólo parámetros que el modelo actual soporta. Cada cambio se audita."
      />

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? null : (
        <div className="space-y-6">
          {msg ? (
            <p
              className={
                "border p-2 text-sm " +
                (msg.kind === "ok"
                  ? "border-positive text-positive"
                  : "border-danger text-danger")
              }
              role="status"
            >
              {msg.text}
            </p>
          ) : null}

          <Card title="Moneda por defecto">
            <p className="mb-2 text-sm text-muted">
              Sugerida al crear un grupo nuevo. Código ISO 4217 (3 letras).
            </p>
            <div className="flex items-end gap-2">
              <input
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
                className="w-24 border border-border-strong bg-bg px-3 py-2 text-sm"
                aria-label="Moneda por defecto"
              />
              <Button
                disabled={currency === (data.settings.default_currency ?? "") || !/^[A-Z]{3}$/.test(currency)}
                onClick={() => setPending({ key: "default_currency", value: currency })}
              >
                Guardar
              </Button>
            </div>
          </Card>

          <Card title="Feature flags">
            <p className="mb-2 text-sm text-muted">
              Interruptores generales. La app los lee al sincronizar configuración.
            </p>
            {Object.keys(flags).length === 0 ? (
              <p className="text-sm text-muted">Sin flags definidos.</p>
            ) : (
              <ul className="divide-y divide-border">
                {Object.entries(flags).map(([k, v]) => (
                  <li key={k} className="flex items-center justify-between py-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={v}
                        onChange={(e) => setFlags((f) => ({ ...f, [k]: e.target.checked }))}
                      />
                      <span className="font-mono">{k}</span>
                    </label>
                    <button
                      type="button"
                      className="text-xs text-danger"
                      onClick={() =>
                        setFlags((f) => {
                          const next = { ...f };
                          delete next[k];
                          return next;
                        })
                      }
                    >
                      quitar
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex items-end gap-2">
              <input
                value={newFlag}
                onChange={(e) => setNewFlag(e.target.value.replace(/[^a-z0-9_.]/gi, "").toLowerCase())}
                placeholder="nombre_del_flag"
                className="w-56 border border-border-strong bg-bg px-3 py-2 font-mono text-xs"
              />
              <Button
                variant="ghost"
                disabled={!newFlag || newFlag in flags}
                onClick={() => {
                  setFlags((f) => ({ ...f, [newFlag]: false }));
                  setNewFlag("");
                }}
              >
                Agregar
              </Button>
              <Button onClick={() => setPending({ key: "feature_flags", value: flags })}>
                Guardar flags
              </Button>
            </div>
          </Card>

          <p className="text-xs text-muted">
            Otros parámetros (zona horaria, límites, más flags) quedan documentados como etapa 2 en
            <code> docs/ADMIN.md</code>.
          </p>
        </div>
      )}

      <ConfirmDialog
        open={pending !== null}
        title="Guardar configuración"
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={save}
      >
        {pending?.key === "default_currency" ? (
          <>Se usará <strong>{pending.value}</strong> como moneda sugerida. Queda registrado en auditoría.</>
        ) : (
          <>Se guardarán los feature flags. Queda registrado en auditoría.</>
        )}
      </ConfirmDialog>
    </div>
  );
}
