"use client";

import { useSyncStatus, type SyncTone } from "./useSyncStatus";

const dotClass: Record<SyncTone, string> = {
  // "Sincronizado" en verde (positive), no en el acento: el acento pasó a ser
  // verde botella / azul-gris con la paleta v2 y "OK" merece su propio color.
  ok: "bg-positive",
  info: "bg-accent animate-pulse",
  warn: "bg-warm",
  danger: "bg-danger",
  muted: "bg-muted",
};

/**
 * Estado de sincronización, discreto y accesible (sección 21): punto + texto
 * (nunca sólo color) dentro de una live region cortés. La decisión de qué
 * mostrar vive en `useSyncStatus` para no contradecir al resto de la UI.
 */
export function SyncBadge() {
  const { tone, label, detail } = useSyncStatus();

  return (
    <span
      className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted"
      role="status"
      aria-live="polite"
      title={detail ?? label}
    >
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 ${dotClass[tone]}`} />
      <span>{label}</span>
    </span>
  );
}
