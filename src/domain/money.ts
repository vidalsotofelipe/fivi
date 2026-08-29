/**
 * Utilidad central de dinero (sección 25 del documento).
 *
 * Reglas:
 *  - Los importes se guardan y se calculan SIEMPRE como enteros en la unidad
 *    monetaria mínima ("minor units"). Nunca floating point para almacenar.
 *  - La cantidad de decimales depende de la moneda (ver `currencies.ts`).
 *  - El formateo usa `Intl.NumberFormat` para respetar moneda y locale.
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
 * Es locale-aware: usa los separadores de la moneda del grupo. Descarta
 * símbolos de moneda, espacios y cualquier caracter no numérico. Ejemplos
 * (moneda ARS, locale es-AR → miles ".", decimal ","):
 *   "$ 1.234,56"  -> 123456
 *   "1234,5"      -> 123450
 *   "1000"        -> 100000
 * Con CLP (0 decimales):
 *   "$ 12.500"    -> 12500
 */
export function toMinorUnits(input: string, code: CurrencyCode): number {
  const info = getCurrencyInfo(code);
  const { group, decimal } = separatorsFor(info.locale);

  // Deja sólo dígitos y los separadores relevantes + signo.
  let cleaned = input.trim().replace(/[^\d.,\-\s ']/g, "");
  cleaned = cleaned.replace(/[\s ']/g, "");

  // Quita separador de miles y normaliza el decimal a ".".
  const escGroup = group.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  cleaned = cleaned.replace(new RegExp(escGroup, "g"), "");
  if (decimal !== ".") {
    cleaned = cleaned.split(decimal).join(".");
  }
  // Cualquier separador remanente que no sea el decimal ya normalizado se elimina.
  const dotCount = (cleaned.match(/\./g) ?? []).length;
  if (dotCount > 1) {
    const lastDot = cleaned.lastIndexOf(".");
    cleaned =
      cleaned.slice(0, lastDot).replace(/\./g, "") + cleaned.slice(lastDot);
  }
  cleaned = cleaned.replace(/,/g, "");

  if (cleaned === "" || cleaned === "-" || cleaned === "." || cleaned === "-.") {
    throw new Error(`Monto inválido: "${input}"`);
  }

  const value = Number(cleaned);
  if (!Number.isFinite(value)) {
    throw new Error(`Monto inválido: "${input}"`);
  }
  return minorFromDecimal(value, code);
}

/**
 * Formatea unidades mínimas como string monetario localizado.
 * Ejemplos: ARS 123456 -> "$ 1.234,56" · USD 45000 -> "US$ 450.00"
 */
export function formatMoney(
  minor: number,
  code: CurrencyCode,
  locale?: string,
): string {
  const info = getCurrencyInfo(code);
  const digits = info.decimal_digits;
  return new Intl.NumberFormat(locale ?? info.locale, {
    style: "currency",
    currency: code,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(fromMinorUnits(minor, code));
}

/**
 * Convierte unidades mínimas a un texto editable, sin separador de miles y con
 * el separador decimal de la moneda. El resultado es re-parseable con
 * `toMinorUnits`. Útil para precargar formularios de edición.
 */
export function minorToRawInput(minor: number, code: CurrencyCode): string {
  const info = getCurrencyInfo(code);
  return new Intl.NumberFormat(info.locale, {
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
