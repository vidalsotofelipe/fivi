/** Helpers de formato para la UI. El dinero se formatea en `domain/money`. */

import { getCurrencyInfo } from "@/domain/currencies";
import type { CurrencyCode } from "@/domain/types";

/** Fecha de hoy en formato ISO corto (YYYY-MM-DD). */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Formatea una fecha ISO corta (YYYY-MM-DD) para mostrar. */
export function formatDate(iso: string, locale = "es-AR"): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(y, m - 1, d));
}

/** Locale sugerido para una moneda (para pasar a Intl). */
export function localeForCurrency(code: CurrencyCode): string {
  return getCurrencyInfo(code).locale;
}
