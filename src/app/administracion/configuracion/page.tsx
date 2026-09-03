"use client";

import { useEffect, useMemo, useState } from "react";
import { adminFetch, AdminApiError } from "@/lib/adminFetch";
import { useApi } from "@/components/admin/useApi";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Button, Card, ErrorState, PageHeader, Skeleton } from "@/components/admin/ui";
import { ADMIN_DEFAULT_TZ } from "@/lib/adminFormat";
import { FLAG_NAME_HELP, FLAG_NAME_RE } from "@/lib/adminSettingsSchema";
import { listCurrencies } from "@/domain/currencies";

interface SettingsResp {
  settings: {
    default_currency?: string;
    timezone?: string;
    feature_flags?: Record<string, boolean>;
  };
  keys: string[];
}

type Pending =
  | { key: "default_currency"; value: string }
  | { key: "timezone"; value: string }
  | { key: "feature_flags"; value: Record<string, boolean> }
  | null;

/** Zonas horarias frecuentes; si la guardada no está, se agrega al vuelo. */
const TZ_OPTIONS = [
  "America/Argentina/Buenos_Aires",
  "America/Montevideo",
  "America/Santiago",
  "America/Sao_Paulo",
  "America/Mexico_City",
  "America/Guatemala",
  "America/Bogota",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/Madrid",
  "UTC",
];

function sameFlags(a: Record<string, boolean>, b: Record<string, boolean>): boolean {
  const ak = Object.keys(a).sort();
  const bk = Object.keys(b).sort();
  return ak.length === bk.length && ak.every((k, i) => bk[i] === k && a[k] === b[k]);
}

export default function AdminConfiguracionPage() {
  const { data, error, loading, reload } = useApi<SettingsResp>("/api/admin/settings");
  const currencies = useMemo(() => listCurrencies(), []);

  const savedCurrency = data?.settings.default_currency ?? "";
  const savedTz = data?.settings.timezone ?? "";
  const savedFlags = useMemo(() => data?.settings.feature_flags ?? {}, [data]);

  const [currency, setCurrency] = useState("");
  const [tz, setTz] = useState("");
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [newFlag, setNewFlag] = useState("");
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (!data) return;
    setCurrency(data.settings.default_currency ?? "");
    setTz(data.settings.timezone ?? "");
    setFlags(data.settings.feature_flags ?? {});
  }, [data]);

  const newFlagError = useMemo<string | null>(() => {
    if (newFlag === "") return null;
    if (!FLAG_NAME_RE.test(newFlag)) return FLAG_NAME_HELP;
    if (newFlag in flags) return "Ya existe un flag con ese nombre.";
    return null;
  }, [newFlag, flags]);

  const flagsChanged = !sameFlags(flags, savedFlags);

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

  const tzChoices = savedTz && !TZ_OPTIONS.includes(savedTz) ? [savedTz, ...TZ_OPTIONS] : TZ_OPTIONS;

  return (
    <div>
      <PageHeader
        title="Configuración"
        description="Sólo parámetros que el modelo actual soporta. Cada cambio se audita."
      />

      {loading ? (
        <div className="space-y-3" role="status" aria-busy="true">
          <span className="sr-only">Cargando configuración…</span>
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
              Sugerida al crear un grupo nuevo. Sólo monedas soportadas.
            </p>
            <div className="flex items-end gap-2">
              <label className="block">
                <span className="label-caps">Moneda</span>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="mt-1 block w-56 border border-border-strong bg-bg px-3 py-2 text-sm"
                >
                  <option value="" disabled>
                    Elegí una moneda
                  </option>
                  {currencies.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                disabled={currency === "" || currency === savedCurrency}
                onClick={() => setPending({ key: "default_currency", value: currency })}
              >
                Guardar
              </Button>
            </div>
          </Card>

          <Card title="Zona horaria">
            <p className="mb-2 text-sm text-muted">
              Todas las fechas del panel se muestran en esta zona (los datos se
              guardan en UTC). Por defecto: {ADMIN_DEFAULT_TZ}.
            </p>
            <div className="flex items-end gap-2">
              <label className="block">
                <span className="label-caps">Zona horaria</span>
                <select
                  value={tz || ADMIN_DEFAULT_TZ}
                  onChange={(e) => setTz(e.target.value)}
                  className="mt-1 block w-72 border border-border-strong bg-bg px-3 py-2 text-sm"
                >
                  {tzChoices.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                disabled={(tz || ADMIN_DEFAULT_TZ) === (savedTz || ADMIN_DEFAULT_TZ)}
                onClick={() =>
                  setPending({ key: "timezone", value: tz || ADMIN_DEFAULT_TZ })
                }
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
            <div className="mt-3 flex flex-wrap items-start gap-2">
              <label className="block">
                <span className="label-caps">Nuevo flag</span>
                <input
                  value={newFlag}
                  onChange={(e) => setNewFlag(e.target.value.trim().toLowerCase())}
                  placeholder="nombre_del_flag"
                  aria-label="Nombre del nuevo feature flag"
                  aria-describedby="flag-help"
                  aria-invalid={newFlagError ? true : undefined}
                  className="mt-1 block w-56 border border-border-strong bg-bg px-3 py-2 font-mono text-xs aria-[invalid=true]:border-danger"
                />
              </label>
              <Button
                variant="ghost"
                disabled={newFlag === "" || newFlagError != null}
                onClick={() => {
                  setFlags((f) => ({ ...f, [newFlag]: false }));
                  setNewFlag("");
                }}
              >
                Agregar
              </Button>
              <Button
                disabled={!flagsChanged}
                onClick={() => setPending({ key: "feature_flags", value: flags })}
              >
                Guardar flags
              </Button>
            </div>
            <p
              id="flag-help"
              className={"mt-1 text-xs " + (newFlagError ? "text-danger" : "text-muted")}
              role={newFlagError ? "alert" : undefined}
            >
              {newFlagError ?? FLAG_NAME_HELP}
            </p>
          </Card>
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
        ) : pending?.key === "timezone" ? (
          <>Las fechas del panel se mostrarán en <strong>{pending.value}</strong>. Queda registrado en auditoría.</>
        ) : (
          <>Se guardarán los feature flags. Queda registrado en auditoría.</>
        )}
      </ConfirmDialog>
    </div>
  );
}
