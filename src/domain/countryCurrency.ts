/**
 * País (ISO 3166-1 alpha-2) → moneda por defecto al crear un grupo.
 *
 * Estructura única y ampliable: para sumar un país basta agregar una fila.
 * NO hay condicionales de país repartidos por componentes; todo pasa por acá.
 * Sólo se usa para la selección inicial: el usuario siempre puede cambiarla.
 */

/** Estados miembro de la zona euro (los que usan EUR como moneda). */
const EURO_ZONE = [
  "AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR",
  "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK",
] as const;

export const COUNTRY_CURRENCY: Record<string, string> = {
  AR: "ARS", // Argentina
  BR: "BRL", // Brasil
  CL: "CLP", // Chile
  GT: "GTQ", // Guatemala
  MX: "MXN", // México
  US: "USD", // Estados Unidos
  GB: "GBP", // Reino Unido
  JP: "JPY", // Japón
  UY: "UYU", // Uruguay
  ...Object.fromEntries(EURO_ZONE.map((c) => [c, "EUR"])),
};

/** Moneda de último recurso cuando no se puede determinar ninguna. */
export const DEFAULT_CURRENCY = "USD";

/** Moneda para un país, o `null` si no está en el mapa. */
export function currencyForCountry(country: string | null | undefined): string | null {
  if (!country) return null;
  return COUNTRY_CURRENCY[country.trim().toUpperCase()] ?? null;
}
