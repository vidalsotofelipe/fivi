"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./Button";
import { useSyncActions, useSyncState } from "./SyncProvider";

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
  const { backend, online, exhausted_count, access_error } = useSyncState();
  const { syncNow } = useSyncActions();
  const [retrying, setRetrying] = useState(false);

  if (backend === "local") return null;

  if (access_error) {
    return (
      <div
        role="alert"
        className="rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
      >
        {t("noAccess")}
      </div>
    );
  }

  if (exhausted_count > 0) {
    return (
      <div
        role="alert"
        className="flex flex-col gap-2 rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
      >
        <p className="font-medium">{t("errorTitle")}</p>
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

  if (!online) {
    return (
      <div
        role="status"
        className="rounded-md border border-border bg-text/[0.04] px-4 py-3 text-sm text-muted"
      >
        {t("offlineBanner")}
      </div>
    );
  }

  return null;
}
