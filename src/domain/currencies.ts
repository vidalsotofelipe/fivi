/**
 * Metadatos de monedas soportadas en fivi.
 *
 * El dato crítico es `decimal_digits`: cuántos decimales usa la moneda, lo que
 * define el factor entre la unidad "mayor" (lo que ve el usuario) y la unidad
 * mínima entera que guardamos. No todas las monedas usan 2 decimales
 * (CLP y JPY usan 0), y toda la aritmética depende de este número.
 */

import type { CurrencyCode } from "./types";

export interface CurrencyInfo {
  code: CurrencyCode;
  /** Nombre para mostrar en el selector y los resúmenes. */
  name: string;
  /** Cantidad de decimales de la moneda (ISO 4217). */
  decimal_digits: number;
  /** Locale sugerido para `Intl.NumberFormat` cuando no se pasa uno explícito. */
  locale: string;
}

/**
 * Catálogo mínimo. La app puede mostrar más monedas vía `Intl`, pero estas son
 * las que aparecen destacadas en el selector (sección 2 del documento).
 */
export const CURRENCIES: Record<string, CurrencyInfo> = {
  ARS: { code: "ARS", name: "Peso argentino", decimal_digits: 2, locale: "es-AR" },
  USD: { code: "USD", name: "Dólar estadounidense", decimal_digits: 2, locale: "en-US" },
  EUR: { code: "EUR", name: "Euro", decimal_digits: 2, locale: "es-ES" },
  BRL: { code: "BRL", name: "Real brasileño", decimal_digits: 2, locale: "pt-BR" },
  CLP: { code: "CLP", name: "Peso chileno", decimal_digits: 0, locale: "es-CL" },
  UYU: { code: "UYU", name: "Peso uruguayo", decimal_digits: 2, locale: "es-UY" },
  GTQ: { code: "GTQ", name: "Quetzal guatemalteco", decimal_digits: 2, locale: "es-GT" },
  GBP: { code: "GBP", name: "Libra esterlina", decimal_digits: 2, locale: "en-GB" },
  MXN: { code: "MXN", name: "Peso mexicano", decimal_digits: 2, locale: "es-MX" },
  JPY: { code: "JPY", name: "Yen japonés", decimal_digits: 0, locale: "ja-JP" },
};

/** Decimales por defecto cuando una moneda no está en el catálogo. */
export const DEFAULT_DECIMAL_DIGITS = 2;

/**
 * Devuelve la info de una moneda. Si el código no está en el catálogo, intenta
 * derivar los decimales desde `Intl` y cae en `DEFAULT_DECIMAL_DIGITS`.
 */
export function getCurrencyInfo(code: CurrencyCode): CurrencyInfo {
  const known = CURRENCIES[code];
  if (known) return known;

  let decimals = DEFAULT_DECIMAL_DIGITS;
  try {
    const resolved = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
    }).resolvedOptions();
    if (typeof resolved.maximumFractionDigits === "number") {
      decimals = resolved.maximumFractionDigits;
    }
  } catch {
    // Código no reconocido por Intl: usamos el default.
  }

  return { code, name: code, decimal_digits: decimals, locale: "es-AR" };
}

/** Factor entre unidad mayor y unidad mínima: 10 ** decimal_digits. */
export function minorUnitFactor(code: CurrencyCode): number {
  return 10 ** getCurrencyInfo(code).decimal_digits;
}

/** Lista ordenada para poblar selectores de moneda. */
export function listCurrencies(): CurrencyInfo[] {
  return Object.values(CURRENCIES).sort((a, b) => a.code.localeCompare(b.code));
}
