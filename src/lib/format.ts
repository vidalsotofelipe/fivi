/**
 * Helpers de formato localizado para la UI. El dinero se calcula en
 * `domain/money`; acá sólo se formatea con el locale de la interfaz, **sin
 * cambiar la moneda del grupo**.
 */

import { formatMoney as domainFormatMoney } from "@/domain/money";
import type { CurrencyCode } from "@/domain/types";
import { BCP47, type Lang } from "@/i18n/config";

/** Fecha de hoy en formato ISO corto (YYYY-MM-DD). */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function bcp47(lang: Lang = "es"): string {
  return BCP47[lang] ?? BCP47.es;
}

/**
 * Parsea un ISO a `Date`. Clave: una **fecha sola** (`YYYY-MM-DD`, sin hora) se
 * interpreta como medianoche **local**, no UTC. `new Date("2026-08-31")` sería
 * medianoche UTC y en husos negativos (p. ej. UTC-3) "adelanta" el día: un
 * evento de hoy se veía como "hace 23 horas". Un ISO con hora/zona se parsea
 * tal cual.
 */
function toLocalDate(iso: string): Date {
  const s = iso.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(s);
}

/** Fecha ISO corta (YYYY-MM-DD) legible: "31 ago 2026" / "Aug 31, 2026". */
export function formatDate(iso: string, lang: Lang = "es"): string {
  const date = toLocalDate(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(bcp47(lang), {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

/** Fecha + hora a partir de un ISO datetime. */
export function formatDateTime(iso: string, lang: Lang = "es"): string {
  const date = toLocalDate(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(bcp47(lang), {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/**
 * Tiempo relativo respecto de ahora: "ahora", "hace 3 min", "ayer",
 * "hace 2 días". Para diferencias grandes cae en la fecha absoluta.
 *
 * Pensado para **timestamps** (`created_at`, con hora y zona). Si se le pasa una
 * fecha sola se toma como medianoche local (ver `toLocalDate`), así nunca
 * reporta un día entero de más por el huso.
 */
export function formatRelative(iso: string, lang: Lang = "es"): string {
  const then = toLocalDate(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffMs = then - Date.now();
  const rtf = new Intl.RelativeTimeFormat(bcp47(lang), { numeric: "auto" });
  const abs = Math.abs(diffMs);
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;

  // < 1 min (en cualquier dirección: el reloj del server puede ir apenas
  // adelantado) -> "ahora" / "now".
  if (abs < min) return rtf.format(0, "second");
  if (abs < hour) return rtf.format(Math.round(diffMs / min), "minute");
  if (abs < day) return rtf.format(Math.round(diffMs / hour), "hour");
  if (abs < 7 * day) return rtf.format(Math.round(diffMs / day), "day");
  return formatDate(iso, lang);
}

/** Minutos enteros desde `iso` hasta ahora (>= 0). Para "Sincronizado hace N min". */
export function minutesSince(iso: string): number {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((Date.now() - then) / 60_000));
}

export function formatNumber(value: number, lang: Lang = "es"): string {
  return new Intl.NumberFormat(bcp47(lang)).format(value);
}

/**
 * Formatea un importe (unidades mínimas) en la moneda del grupo, con el locale
 * de la interfaz. Cambiar el idioma NO cambia `code`.
 */
export function formatMoney(
  minor: number,
  code: CurrencyCode,
  lang: Lang = "es",
): string {
  return domainFormatMoney(minor, code, bcp47(lang));
}
