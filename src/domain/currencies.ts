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
  // América Latina
  ARS: { code: "ARS", name: "Peso argentino", decimal_digits: 2, locale: "es-AR" },
  BOB: { code: "BOB", name: "Boliviano", decimal_digits: 2, locale: "es-BO" },
  BRL: { code: "BRL", name: "Real brasileño", decimal_digits: 2, locale: "pt-BR" },
  CLP: { code: "CLP", name: "Peso chileno", decimal_digits: 0, locale: "es-CL" },
  COP: { code: "COP", name: "Peso colombiano", decimal_digits: 2, locale: "es-CO" },
  CRC: { code: "CRC", name: "Colón costarricense", decimal_digits: 2, locale: "es-CR" },
  DOP: { code: "DOP", name: "Peso dominicano", decimal_digits: 2, locale: "es-DO" },
  GTQ: { code: "GTQ", name: "Quetzal guatemalteco", decimal_digits: 2, locale: "es-GT" },
  HNL: { code: "HNL", name: "Lempira hondureño", decimal_digits: 2, locale: "es-HN" },
  MXN: { code: "MXN", name: "Peso mexicano", decimal_digits: 2, locale: "es-MX" },
  NIO: { code: "NIO", name: "Córdoba nicaragüense", decimal_digits: 2, locale: "es-NI" },
  PEN: { code: "PEN", name: "Sol peruano", decimal_digits: 2, locale: "es-PE" },
  PYG: { code: "PYG", name: "Guaraní paraguayo", decimal_digits: 0, locale: "es-PY" },
  UYU: { code: "UYU", name: "Peso uruguayo", decimal_digits: 2, locale: "es-UY" },
  VES: { code: "VES", name: "Bolívar venezolano", decimal_digits: 2, locale: "es-VE" },

  // Resto del mundo (las más frecuentes en viajes)
  USD: { code: "USD", name: "Dólar estadounidense", decimal_digits: 2, locale: "en-US" },
  EUR: { code: "EUR", name: "Euro", decimal_digits: 2, locale: "es-ES" },
  GBP: { code: "GBP", name: "Libra esterlina", decimal_digits: 2, locale: "en-GB" },
  CAD: { code: "CAD", name: "Dólar canadiense", decimal_digits: 2, locale: "en-CA" },
  CHF: { code: "CHF", name: "Franco suizo", decimal_digits: 2, locale: "de-CH" },
  AUD: { code: "AUD", name: "Dólar australiano", decimal_digits: 2, locale: "en-AU" },
  NZD: { code: "NZD", name: "Dólar neozelandés", decimal_digits: 2, locale: "en-NZ" },
  SEK: { code: "SEK", name: "Corona sueca", decimal_digits: 2, locale: "sv-SE" },
  NOK: { code: "NOK", name: "Corona noruega", decimal_digits: 2, locale: "nb-NO" },
  DKK: { code: "DKK", name: "Corona danesa", decimal_digits: 2, locale: "da-DK" },
  PLN: { code: "PLN", name: "Złoty polaco", decimal_digits: 2, locale: "pl-PL" },
  CZK: { code: "CZK", name: "Corona checa", decimal_digits: 2, locale: "cs-CZ" },
  JPY: { code: "JPY", name: "Yen japonés", decimal_digits: 0, locale: "ja-JP" },
  CNY: { code: "CNY", name: "Yuan chino", decimal_digits: 2, locale: "zh-CN" },
  KRW: { code: "KRW", name: "Won surcoreano", decimal_digits: 0, locale: "ko-KR" },
  INR: { code: "INR", name: "Rupia india", decimal_digits: 2, locale: "hi-IN" },
  THB: { code: "THB", name: "Baht tailandés", decimal_digits: 2, locale: "th-TH" },
  ZAR: { code: "ZAR", name: "Rand sudafricano", decimal_digits: 2, locale: "en-ZA" },
  TRY: { code: "TRY", name: "Lira turca", decimal_digits: 2, locale: "tr-TR" },
  ILS: { code: "ILS", name: "Séquel israelí", decimal_digits: 2, locale: "he-IL" },
  AED: { code: "AED", name: "Dirham de EAU", decimal_digits: 2, locale: "ar-AE" },
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

/**
 * ¿`code` es una moneda usable? Acepta el catálogo explícito (ARS, USD, EUR,
 * GTQ, …) y cualquier código de la lista ISO 4217 que conoce el runtime
 * (`Intl.supportedValuesOf`). Rechaza inventos como "ABC".
 *
 * Nota: `Intl.NumberFormat` NO sirve para validar —acepta cualquier cadena de
 * 3 letras y la formatea igual—, por eso se usa la lista de `supportedValuesOf`.
 */
let iso4217: Set<string> | null = null;
function isoCodes(): Set<string> {
  if (iso4217) return iso4217;
  try {
    const sv = (
      Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
    ).supportedValuesOf;
    iso4217 = new Set(sv ? sv("currency") : []);
  } catch {
    iso4217 = new Set();
  }
  return iso4217;
}

export function isSupportedCurrency(code: string | null | undefined): boolean {
  if (!code || !/^[A-Z]{3}$/.test(code)) return false;
  if (Object.prototype.hasOwnProperty.call(CURRENCIES, code)) return true;
  return isoCodes().has(code);
}
