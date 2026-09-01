import { toMinorUnits } from "@/domain/money";
import type { CurrencyCode } from "@/domain/types";

/**
 * Parsea el texto crudo de un campo de monto a unidades mínimas de la moneda.
 * Devuelve `null` si el texto no es un número positivo válido.
 */
export function parseAmount(
  raw: string,
  currency: CurrencyCode,
): number | null {
  try {
    const minor = toMinorUnits(raw, currency);
    return minor > 0 ? minor : null;
  } catch {
    return null;
  }
}
