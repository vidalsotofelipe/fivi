/**
 * Formateo para el panel de administración.
 *
 * Reglas:
 *  - Las fechas se guardan SIEMPRE en UTC (`timestamptz` en Postgres, ISO en la
 *    API). Acá se muestran en una zona horaria fija —Argentina por defecto—,
 *    NUNCA en la zona del navegador de quien mira el panel (un admin en otro
 *    huso veía las 03:15Z como "8:15 p. m.").
 *  - La zona se puede cambiar desde Configuración (`timezone`); hasta que se
 *    cargue esa preferencia se usa `ADMIN_DEFAULT_TZ`.
 *  - El locale de la UI es es-AR; la moneda la fija cada grupo.
 */

export const ADMIN_DEFAULT_TZ = "America/Argentina/Buenos_Aires";
const ADMIN_LOCALE = "es-AR";

let displayTz = ADMIN_DEFAULT_TZ;

/** ¿`tz` es una zona IANA que este runtime entiende? */
export function isValidTimeZone(tz: string): boolean {
  if (!tz || typeof tz !== "string") return false;
  try {
    // Lanza RangeError si el identificador no es válido.
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Fija la zona horaria de visualización del panel (desde Configuración). */
export function setAdminTimeZone(tz: string | null | undefined): void {
  displayTz = tz && isValidTimeZone(tz) ? tz : ADMIN_DEFAULT_TZ;
}

export function getAdminTimeZone(): string {
  return displayTz;
}

export function money(minorUnits: number, currency: string): string {
  try {
    return new Intl.NumberFormat(ADMIN_LOCALE, { style: "currency", currency }).format(
      minorUnits / 100,
    );
  } catch {
    return `${(minorUnits / 100).toFixed(2)} ${currency}`;
  }
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString(ADMIN_LOCALE, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: displayTz,
      });
}

export function date(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(ADMIN_LOCALE, {
        dateStyle: "medium",
        timeZone: displayTz,
      });
}

export function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

/** Entorno de build en castellano (no se muestra el identificador crudo). */
export function envLabel(env: string): string {
  const map: Record<string, string> = {
    production: "Producción",
    preview: "Vista previa",
    development: "Desarrollo",
    test: "Pruebas",
  };
  return map[env] ?? env;
}

/** Rol dentro de un grupo, en castellano. */
export function roleLabel(role: string): string {
  const map: Record<string, string> = {
    owner: "Creador",
    member: "Miembro",
  };
  return map[role] ?? role;
}

/** Tipo de feedback, con su emoji (mismo lenguaje visual que el formulario). */
export function feedbackTypeLabel(type: string): string {
  const map: Record<string, string> = {
    bug: "🐞 Problema",
    suggestion: "💡 Sugerencia",
    question: "🙋 Consulta",
    other: "💬 Comentario",
  };
  return map[type] ?? type;
}

/** Estado de feedback, en castellano. */
export function feedbackStatusLabel(status: string): string {
  const map: Record<string, string> = {
    new: "Nuevo",
    reviewing: "Revisando",
    planned: "Planificado",
    resolved: "Resuelto",
    discarded: "Descartado",
  };
  return map[status] ?? status;
}
