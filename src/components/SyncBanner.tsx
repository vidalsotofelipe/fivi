"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./Button";
import { useSyncActions } from "./SyncProvider";
import { useSyncStatus } from "./useSyncStatus";

/**
 * Avisos transversales de sincronización, por encima del contenido (sección 21):
 *
 *  - **error del servidor** (`exhausted_count > 0`): banner de alerta con
 *    acción "Reintentar" que fuerza una corrida de sync.
 *  - **sin acceso al grupo** (`access_error`): alerta sin acción (reintentar no
 *    ayuda; hace falta una invitación válida).
 *  - **sin conexión** (`!online`): aviso informativo — los cambios locales se
 *    sincronizan al volver la conexión.
 *
 * En modo local (sin Supabase) no muestra nada: no hay servidor con el que
 * desincronizarse.
 */
export function SyncBanner() {
  const { t } = useTranslation("sync");
  const { kind, label } = useSyncStatus();
  const { syncNow } = useSyncActions();
  const [retrying, setRetrying] = useState(false);

  if (kind === "local") return null;

  if (kind === "no-access") {
    return (
      <div
        role="alert"
        className="border-2 border-danger bg-danger/10 px-4 py-3 text-sm text-danger"
      >
        {t("noAccess")}
      </div>
    );
  }

  if (kind === "exhausted") {
    return (
      <div
        role="alert"
        className="flex flex-col gap-2 border-2 border-danger bg-danger/10 px-4 py-3 text-sm text-danger"
      >
        <p className="font-bold">{t("errorTitle")}</p>
        {/* El mismo texto que el badge de arriba: no puede contradecirlo. */}
        <p>{label}</p>
        <Button
          variant="secondary"
          className="self-start"
          loading={retrying}
          onClick={async () => {
            setRetrying(true);
            try {
              await syncNow();
            } finally {
              setRetrying(false);
            }
          }}
        >
          {t("errorRetry")}
        </Button>
      </div>
    );
  }

  if (kind === "offline" || kind === "offline-pending") {
    return (
      <div
        role="status"
        className="border-2 border-border bg-surface-raised px-4 py-3 text-sm text-muted"
      >
        {t("offlineBanner")}
      </div>
    );
  }

  return null;
}
