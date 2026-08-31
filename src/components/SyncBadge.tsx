"use client";

import { useSyncState } from "./SyncProvider";

/**
 * Indicador discreto del estado de sincronización (sección 21). Nunca bloquea
 * funciones; sólo informa.
 */
export function SyncBadge() {
  const {
    backend,
    online,
    syncing,
    pending_count,
    exhausted_count,
    last_error,
    access_error,
  } = useSyncState();

  let dot = "bg-emerald-500";
  let label = "Sincronizado";

  if (backend === "local") {
    dot = "bg-gray-400";
    label = "En este dispositivo";
  } else if (access_error) {
    dot = "bg-red-500";
    label = "Sin acceso al grupo";
  } else if (exhausted_count > 0) {
    dot = "bg-red-500";
    label = `${exhausted_count} sin sincronizar`;
  } else if (last_error) {
    dot = "bg-amber-500";
    label = "Reintentando…";
  } else if (!online) {
    dot = "bg-gray-400";
    label =
      pending_count > 0
        ? `Sin conexión · ${pending_count} pendiente${pending_count === 1 ? "" : "s"}`
        : "Sin conexión";
  } else if (syncing) {
    dot = "bg-sky-500 animate-pulse";
    label = "Sincronizando";
  } else if (pending_count > 0) {
    dot = "bg-sky-500";
    label = `${pending_count} pendiente${pending_count === 1 ? "" : "s"}`;
  }

  return (
    <span
      className="flex items-center gap-1.5 whitespace-nowrap text-xs opacity-60"
      title={
        backend === "local"
          ? "Sin servidor configurado: los datos viven sólo en este dispositivo."
          : access_error ?? last_error ?? label
      }
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
      <span>{label}</span>
    </span>
  );
}
