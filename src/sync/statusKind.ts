/**
 * Estado de sincronización que se le muestra al usuario, en un solo lugar.
 *
 * Función pura y única fuente de verdad: la usan el badge de la barra superior,
 * la línea del resumen y el banner. Antes cada componente decidía por su cuenta
 * y podían contradecirse ("19 sin sincronizar" arriba y "Sincronizado recién"
 * abajo, en la misma pantalla).
 *
 * El orden de los casos es deliberado: primero lo que bloquea (sin acceso,
 * rechazos del servidor), después lo transitorio (reintentando, sin conexión,
 * sincronizando) y al final lo normal.
 */
import type { SyncState } from "./types";

export type SyncStatusKind =
  /** Sin servidor configurado: los datos viven sólo en este dispositivo. */
  | "local"
  /** El servidor rechaza por falta de acceso al grupo (hace falta invitación). */
  | "no-access"
  /** El servidor rechazó cambios y se agotaron los reintentos. Requiere acción. */
  | "exhausted"
  /** La última corrida falló entera (red/transporte); se reintenta solo. */
  | "retrying"
  /** Sin conexión, con cambios locales esperando. */
  | "offline-pending"
  /** Sin conexión, nada pendiente. */
  | "offline"
  /** Corrida en curso. */
  | "syncing"
  /** Cambios locales en cola, sin error. */
  | "pending"
  /** Todo al día. */
  | "synced";

export interface SyncStatusInput
  extends Pick<
    SyncState,
    | "online"
    | "syncing"
    | "pending_count"
    | "exhausted_count"
    | "last_error"
    | "access_error"
  > {
  backend: "cloud" | "local";
}

export function syncStatusKind(s: SyncStatusInput): SyncStatusKind {
  if (s.backend === "local") return "local";
  if (s.access_error) return "no-access";
  if (s.exhausted_count > 0) return "exhausted";
  if (s.last_error) return "retrying";
  if (!s.online) return s.pending_count > 0 ? "offline-pending" : "offline";
  if (s.syncing) return "syncing";
  if (s.pending_count > 0) return "pending";
  return "synced";
}

/**
 * `true` sólo cuando no hay nada pendiente ni ningún error: es el único caso en
 * el que tiene sentido decir "sincronizado hace X". En cualquier otro, mostrar
 * una marca de tiempo sería engañoso.
 */
export function isFullySynced(kind: SyncStatusKind): boolean {
  return kind === "synced";
}

/** Los estados que requieren que el usuario haga algo (no se resuelven solos). */
export function needsAttention(kind: SyncStatusKind): boolean {
  return kind === "exhausted" || kind === "no-access";
}
