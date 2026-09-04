/**
 * País (ISO 3166-1 alpha-2) → moneda por defecto al crear un grupo.
 *
 * Estructura única y ampliable: para sumar un país basta agregar una fila.
 * NO hay condicionales de país repartidos por componentes; todo pasa por acá.
 * Sólo se usa para la selección inicial: el usuario siempre puede cambiarla.
 *
 * Regla: **si sabemos desde qué país te conectás, gana esa moneda**. Si el país
 * no está en este mapa (o su moneda no está soportada), se usa USD — no se
 * adivina con el idioma del navegador, que suele mentir.
 */

/** Estados miembro de la zona euro (los que usan EUR como moneda). */
const EURO_ZONE = [
  "AD", "AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR",
  "HR", "IE", "IT", "LT", "LU", "LV", "MC", "MT", "NL", "PT",
  "SI", "SK", "SM", "VA",
] as const;

/** Países que usan el dólar estadounidense como moneda de curso legal. */
const USD_ZONE = [
  "US", "EC", "SV", "PA", "PR", "TC", "VG", "BQ", "TL", "FM", "MH", "PW",
] as const;

export const COUNTRY_CURRENCY: Record<string, string> = {
  // América Latina y el Caribe
  AR: "ARS", // Argentina
  BO: "BOB", // Bolivia
  BR: "BRL", // Brasil
  CL: "CLP", // Chile
  CO: "COP", // Colombia
  CR: "CRC", // Costa Rica
  DO: "DOP", // República Dominicana
  GT: "GTQ", // Guatemala
  HN: "HNL", // Honduras
  MX: "MXN", // México
  NI: "NIO", // Nicaragua
  PE: "PEN", // Perú
  PY: "PYG", // Paraguay
  UY: "UYU", // Uruguay
  VE: "VES", // Venezuela

  // Resto del mundo
  GB: "GBP", // Reino Unido
  CA: "CAD", // Canadá
  CH: "CHF", // Suiza
  LI: "CHF", // Liechtenstein
  AU: "AUD", // Australia
  NZ: "NZD", // Nueva Zelanda
  SE: "SEK", // Suecia
  NO: "NOK", // Noruega
  DK: "DKK", // Dinamarca
  PL: "PLN", // Polonia
  CZ: "CZK", // Chequia
  JP: "JPY", // Japón
  CN: "CNY", // China
  KR: "KRW", // Corea del Sur
  IN: "INR", // India
  TH: "THB", // Tailandia
  ZA: "ZAR", // Sudáfrica
  TR: "TRY", // Turquía
  IL: "ILS", // Israel
  AE: "AED", // Emiratos Árabes Unidos

  ...Object.fromEntries(EURO_ZONE.map((c) => [c, "EUR"])),
  ...Object.fromEntries(USD_ZONE.map((c) => [c, "USD"])),
};

/** Moneda de último recurso cuando no se puede determinar ninguna. */
export const DEFAULT_CURRENCY = "USD";

/** Moneda para un país, o `null` si no está en el mapa. */
export function currencyForCountry(country: string | null | undefined): string | null {
  if (!country) return null;
  return COUNTRY_CURRENCY[country.trim().toUpperCase()] ?? null;
}
