"use client";

import { useTranslation } from "react-i18next";
import {
  isFullySynced,
  needsAttention,
  syncStatusKind,
  type SyncStatusKind,
} from "@/sync/statusKind";
import { useSyncState } from "./SyncProvider";

export type SyncTone = "ok" | "info" | "warn" | "danger" | "muted";

export interface SyncStatusView {
  kind: SyncStatusKind;
  tone: SyncTone;
  /** Texto corto ya traducido (nunca sólo color). */
  label: string;
  /** Texto largo para `title`, o `null`. */
  detail: string | null;
  /** Todo al día: recién ahí tiene sentido mostrar "sincronizado hace X". */
  fullySynced: boolean;
  /** Requiere acción del usuario (el banner ofrece "Reintentar"). */
  needsAttention: boolean;
}

const TONES: Record<SyncStatusKind, SyncTone> = {
  local: "muted",
  "no-access": "danger",
  exhausted: "danger",
  retrying: "warn",
  "offline-pending": "muted",
  offline: "muted",
  syncing: "info",
  pending: "info",
  synced: "ok",
};

/**
 * Lectura única del estado de sincronización para toda la UI. Cualquier
 * componente que muestre el estado debe usar este hook: así el badge, la línea
 * del resumen y el banner no pueden decir cosas distintas.
 */
export function useSyncStatus(): SyncStatusView {
  const { t } = useTranslation("sync");
  const state = useSyncState();
  const kind = syncStatusKind(state);

  const label = (() => {
    switch (kind) {
      case "local":
        return t("onDevice");
      case "no-access":
        return t("noAccess");
      case "exhausted":
        return t("unsynced", { count: state.exhausted_count });
      case "retrying":
        return t("retrying");
      case "offline-pending":
        return t("offlinePending", { count: state.pending_count });
      case "offline":
        return t("offline");
      case "syncing":
        return t("syncing");
      case "pending":
        return t("pending", { count: state.pending_count });
      case "synced":
        return t("synced");
    }
  })();

  return {
    kind,
    tone: TONES[kind],
    label,
    detail:
      kind === "local"
        ? t("localOnlyHint")
        : (state.access_error ?? state.last_error ?? null),
    fullySynced: isFullySynced(kind),
    needsAttention: needsAttention(kind),
  };
}
