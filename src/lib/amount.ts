import { toMinorUnits } from "@/domain/money";
import type { CurrencyCode } from "@/domain/types";

/**
 * Parsea el texto crudo de un campo de monto a unidades mínimas de la moneda.
 * Devuelve `null` si el texto no es un número positivo válido.
 *
 * `locale` es el de la **interfaz** (no el de la moneda): decide si "10,50" son
 * diez con cincuenta o mil cincuenta. Ver `toMinorUnits`.
 */
export function parseAmount(
  raw: string,
  currency: CurrencyCode,
  locale: string,
): number | null {
  try {
    const minor = toMinorUnits(raw, currency, locale);
    return minor > 0 ? minor : null;
  } catch {
    return null;
  }
}
