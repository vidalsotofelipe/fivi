/**
 * Generación de identificadores (sección 19 del documento).
 *
 * Todos los ids se generan localmente para poder crear datos sin conexión y
 * sin depender del servidor. Se usan UUID v4.
 */

/** Devuelve un UUID v4 nuevo. */
export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback para entornos sin crypto.randomUUID (muy poco habitual hoy).
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Timestamp actual en ISO 8601 UTC. */
export function nowIso(): string {
  return new Date().toISOString();
}
