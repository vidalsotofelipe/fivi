/**
 * Utilidad central de dinero (sección 25 del documento).
 *
 * Reglas:
 *  - Los importes se guardan y se calculan SIEMPRE como enteros en la unidad
 *    monetaria mínima ("minor units"). Nunca floating point para almacenar.
 *  - La cantidad de decimales depende de la moneda (ver `currencies.ts`).
 *  - El formateo usa `Intl.NumberFormat` para respetar moneda y locale.
 *  - El **parseo** usa el locale de la interfaz, no el de la moneda (ver
 *    `toMinorUnits`).
 *
 * Todas las demás capas (split, balances, settlement, repos, UI) deben pasar
 * por estas funciones y no reimplementar aritmética de dinero.
 */

import type { CurrencyCode } from "./types";
import { getCurrencyInfo, minorUnitFactor } from "./currencies";

/** Separadores de miles y decimal para un locale dado. */
function separatorsFor(locale: string): { group: string; decimal: string } {
  const parts = new Intl.NumberFormat(locale).formatToParts(11111.1);
  const group = parts.find((p) => p.type === "group")?.value ?? ",";
  const decimal = parts.find((p) => p.type === "decimal")?.value ?? ".";
  return { group, decimal };
}

/**
 * Convierte un número "mayor" (lo que ve el usuario, p. ej. 25.5) a unidades
 * mínimas enteras según la moneda. Redondea al entero más cercano.
 */
export function minorFromDecimal(value: number, code: CurrencyCode): number {
  if (!Number.isFinite(value)) {
    throw new Error(`Monto inválido: ${value}`);
  }
  return Math.round(value * minorUnitFactor(code));
}

/** Convierte unidades mínimas enteras a número "mayor" para mostrar/operar. */
export function fromMinorUnits(minor: number, code: CurrencyCode): number {
  return minor / minorUnitFactor(code);
}

/**
 * Parsea texto ingresado por el usuario a unidades mínimas enteras.
 *
 * El separador decimal lo decide el **locale de la interfaz**, NUNCA la moneda:
 * quien escribe es la persona. Con la app en español "10,50" son diez con
 * cincuenta, sea ARS, USD, EUR o GTQ; en inglés eso mismo se escribe "10.50".
 * (Antes se usaba el locale de la moneda: app en español + grupo en USD hacía
 * que "10,50" se leyera como 1.050,00 — cien veces más.)
 *
 * Reglas de desambiguación, en orden y sin casos librados al azar:
 *  1. Si aparecen los dos separadores, el ÚLTIMO es el decimal:
 *     "1.234,56" y "1,234.56" -> 1234.56.
 *  2. Si aparece uno solo pero repetido, es separador de miles: "1.234.567".
 *  3. Si aparece uno solo, una vez:
 *     - con exactamente 3 dígitos detrás es genuinamente ambiguo ("1.234") y
 *       decide el locale;
 *     - con cualquier otra cantidad es decimal ("10,5", "10,50", "1,2345").
 *
 * Se descartan símbolos de moneda, espacios y cualquier otro caracter.
 * Ejemplos con locale es-AR: "$ 1.234,56" -> 123456 · "1000" -> 100000.
 * Con CLP (0 decimales): "$ 12.500" -> 12500.
 */
export function toMinorUnits(
  input: string,
  code: CurrencyCode,
  locale: string,
): number {
  const compact = input.trim().replace(/[^\d.,-]/g, "");
  const negative = compact.startsWith("-");
  const body = compact.replace(/-/g, "");

  const dots = (body.match(/\./g) ?? []).length;
  const commas = (body.match(/,/g) ?? []).length;

  let decimalSep: "." | "," | null = null;
  if (dots > 0 && commas > 0) {
    decimalSep = body.lastIndexOf(".") > body.lastIndexOf(",") ? "." : ",";
  } else if (dots + commas === 1) {
    const sep: "." | "," = dots === 1 ? "." : ",";
    const digitsAfter = body.length - body.lastIndexOf(sep) - 1;
    decimalSep =
      digitsAfter === 3
        ? separatorsFor(locale).decimal === sep
          ? sep
          : null
        : sep;
  }
  // Un solo tipo de separador, repetido: son miles. `decimalSep` queda null.

  const idx = decimalSep === null ? -1 : body.lastIndexOf(decimalSep);
  const cleaned =
    idx < 0
      ? body.replace(/[.,]/g, "")
      : `${body.slice(0, idx).replace(/[.,]/g, "")}.${body.slice(idx + 1)}`;

  if (cleaned === "" || cleaned === ".") {
    throw new Error(`Monto inválido: "${input}"`);
  }

  const value = Number(cleaned);
  if (!Number.isFinite(value)) {
    throw new Error(`Monto inválido: "${input}"`);
  }
  return minorFromDecimal(negative ? -value : value, code);
}

/**
 * Formatea unidades mínimas como string monetario localizado.
 * Ejemplos: ARS 123456 -> "$ 1.234,56" · USD 45000 -> "US$ 450.00"
 *
 * `display: "code"` fuerza el código ISO en vez del símbolo
 * ("ARS 1.234,56"), para las pantallas donde conviven varias monedas y "$"
 * sería ambiguo (dashboard, tarjetas de grupo con conversión).
 */
export function formatMoney(
  minor: number,
  code: CurrencyCode,
  locale?: string,
  { display = "symbol" }: { display?: "symbol" | "code" } = {},
): string {
  const info = getCurrencyInfo(code);
  const digits = info.decimal_digits;
  return new Intl.NumberFormat(locale ?? info.locale, {
    style: "currency",
    currency: code,
    currencyDisplay: display === "code" ? "code" : "symbol",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(fromMinorUnits(minor, code));
}

/**
 * Convierte unidades mínimas a un texto editable, sin separador de miles y con
 * el separador decimal **del locale de la interfaz** (el mismo que entiende
 * `toMinorUnits`), para que el valor precargado se re-parsee igual.
 */
export function minorToRawInput(
  minor: number,
  code: CurrencyCode,
  locale: string,
): string {
  const info = getCurrencyInfo(code);
  return new Intl.NumberFormat(locale, {
    useGrouping: false,
    minimumFractionDigits: 0,
    maximumFractionDigits: info.decimal_digits,
  }).format(fromMinorUnits(minor, code));
}

/**
 * Reparte `totalMinor` (entero) entre `n` porciones lo más iguales posible.
 * Devuelve un array de longitud `n` con la suma EXACTAMENTE igual a `totalMinor`.
 * Las unidades sobrantes se asignan a las primeras porciones (determinístico).
 * Soporta montos negativos (reembolsos).
 */
export function distributeMinor(totalMinor: number, n: number): number[] {
  if (!Number.isInteger(totalMinor)) {
    throw new Error(`distributeMinor requiere un entero, recibió ${totalMinor}`);
  }
  if (n <= 0) {
    throw new Error(`distributeMinor requiere n > 0, recibió ${n}`);
  }
  const sign = totalMinor < 0 ? -1 : 1;
  const abs = Math.abs(totalMinor);
  const base = Math.floor(abs / n);
  let remainder = abs - base * n;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder--;
    out.push(sign * (base + extra));
  }
  return out;
}

/**
 * Reparte `totalMinor` (entero) en proporción a `weights` (pesos no negativos:
 * porcentajes, partes, cantidades…). Devuelve enteros que suman EXACTAMENTE
 * `totalMinor`, usando el método del resto mayor (Hamilton) con desempate por
 * índice para que el resultado sea determinístico.
 */
export function distributeByWeights(
  totalMinor: number,
  weights: number[],
): number[] {
  if (!Number.isInteger(totalMinor)) {
    throw new Error(`distributeByWeights requiere un entero, recibió ${totalMinor}`);
  }
  if (weights.length === 0) {
    throw new Error("distributeByWeights requiere al menos un peso");
  }
  if (weights.some((w) => !Number.isFinite(w) || w < 0)) {
    throw new Error("Los pesos deben ser números no negativos");
  }
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (sumW <= 0) {
    throw new Error("La suma de los pesos debe ser mayor que cero");
  }

  const sign = totalMinor < 0 ? -1 : 1;
  const abs = Math.abs(totalMinor);
  const exact = weights.map((w) => (abs * w) / sumW);
  const out = exact.map((x) => Math.floor(x));
  let remainder = abs - out.reduce((a, b) => a + b, 0);

  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; k < order.length && remainder > 0; k++) {
    const idx = order[k]!.i;
    out[idx] = (out[idx] ?? 0) + 1;
    remainder--;
  }

  return out.map((v) => sign * v);
}
