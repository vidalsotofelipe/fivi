/**
 * Validación del rango de fechas de los filtros del panel (Movimientos,
 * Auditoría). Pura, sin dependencias: la usan tanto la UI como los Route
 * Handlers.
 *
 * Reglas:
 *  - Si falta alguno de los dos extremos, no hay rango que validar.
 *  - `YYYY-MM-DD` (lo que produce `<input type="date">`) se compara como texto,
 *    que para ese formato equivale a comparar cronológicamente. Para ISO
 *    completos se cae en `Date.parse`.
 */
export const DATE_RANGE_MESSAGE =
  "La fecha desde no puede ser posterior a la fecha hasta";

export function dateRangeError(
  from?: string | null,
  to?: string | null,
): string | null {
  if (!from || !to) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const invalid =
    iso.test(from) && iso.test(to)
      ? from > to
      : (() => {
          const a = Date.parse(from);
          const b = Date.parse(to);
          return Number.isFinite(a) && Number.isFinite(b) && a > b;
        })();
  return invalid ? DATE_RANGE_MESSAGE : null;
}

/** Booleano equivalente, para el backend. */
export function dateRangeInvalid(
  from: string | null,
  to: string | null,
): boolean {
  return dateRangeError(from, to) !== null;
}
