/**
 * Validación del monto al saldar una deuda desde "Quién le debe a quién".
 * Pura: la UI traduce el discriminante a un mensaje.
 *
 *  - `amountMinor` null → todavía sin monto válido (no se muestra error).
 *  - `> 0` obligatorio.
 *  - si hay `maxMinor` (se llegó por "Saldar"), no puede superarlo.
 */
export type SettleAmountError = "positive" | "over" | null;

export function settleAmountError(
  amountMinor: number | null,
  maxMinor: number | null,
): SettleAmountError {
  if (amountMinor == null) return null;
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) return "positive";
  if (maxMinor != null && amountMinor > maxMinor) return "over";
  return null;
}
