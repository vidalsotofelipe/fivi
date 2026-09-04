/**
 * Límites de longitud de los textos que escribe la gente.
 *
 * Una sola fuente de verdad para las tres capas:
 *  - la UI los muestra (`maxLength` + contador) para que el límite no sorprenda;
 *  - los repos los validan antes de guardar en IndexedDB;
 *  - Postgres los tiene como `check` (migración 0016), así que un cliente viejo
 *    o manipulado tampoco puede pasarse.
 */

/** Nombre del grupo. */
export const GROUP_NAME_MAX = 60;
/** Descripción del grupo. */
export const GROUP_DESCRIPTION_MAX = 120;
/** Descripción de un gasto. */
export const EXPENSE_DESCRIPTION_MAX = 120;
/** Nota de un pago. */
export const PAYMENT_NOTE_MAX = 120;
/** Nombre de un participante. */
export const PARTICIPANT_NAME_MAX = 60;

/** Error de longitud, con el campo y el máximo, para que la UI lo traduzca. */
export class TooLongError extends Error {
  readonly field: string;
  readonly max: number;
  constructor(field: string, max: number) {
    super(`${field} supera ${max} caracteres`);
    this.name = "TooLongError";
    this.field = field;
    this.max = max;
  }
}

/** Corta espacios y valida el largo. Devuelve el texto ya normalizado. */
export function checkLength(
  value: string,
  field: string,
  max: number,
): string {
  const trimmed = value.trim();
  if (trimmed.length > max) throw new TooLongError(field, max);
  return trimmed;
}
