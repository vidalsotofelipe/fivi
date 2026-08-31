"use client";

import { useTranslation } from "react-i18next";
import { useSyncState } from "./SyncProvider";

type Tone = "ok" | "info" | "warn" | "danger" | "muted";

const dotClass: Record<Tone, string> = {
  ok: "bg-accent",
  info: "bg-accent animate-pulse",
  warn: "bg-warning",
  danger: "bg-danger",
  muted: "bg-muted",
};

/**
 * Estado de sincronización, discreto y accesible (sección 21): punto + texto
 * (nunca sólo color) dentro de una live region cortés.
 */
export function SyncBadge() {
  const { t } = useTranslation("sync");
  const {
    backend,
    online,
    syncing,
    pending_count,
    exhausted_count,
    last_error,
    access_error,
  } = useSyncState();

  let tone: Tone = "ok";
  let label = t("synced");

  if (backend === "local") {
    tone = "muted";
    label = t("onDevice");
  } else if (access_error) {
    tone = "danger";
    label = t("noAccess");
  } else if (exhausted_count > 0) {
    tone = "danger";
    label = t("unsynced", { count: exhausted_count });
  } else if (last_error) {
    tone = "warn";
    label = t("retrying");
  } else if (!online) {
    tone = "muted";
    label =
      pending_count > 0
        ? t("offlinePending", { count: pending_count })
        : t("offline");
  } else if (syncing) {
    tone = "info";
    label = t("syncing");
  } else if (pending_count > 0) {
    tone = "info";
    label = t("pending", { count: pending_count });
  }

  return (
    <span
      className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted"
      role="status"
      aria-live="polite"
      title={
        backend === "local"
          ? t("localOnlyHint")
          : (access_error ?? last_error ?? label)
      }
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 shrink-0 rounded-full ${dotClass[tone]}`}
      />
      <span>{label}</span>
    </span>
  );
}
