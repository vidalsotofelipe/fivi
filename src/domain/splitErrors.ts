/**
 * Errores de reparto **tipados**. El dominio no arma texto para el usuario: sólo
 * dice qué regla se violó y con qué números. La UI los traduce (i18n) y formatea
 * los importes con la moneda del grupo y el locale de la interfaz.
 *
 * Antes estos errores eran strings en español creados en `domain/split.ts`, así
 * que una interfaz en inglés mostraba "La suma de los pesos…" y los importes
 * aparecían en unidades mínimas internas ("asignado 12000, total 10000").
 */

export type SplitErrorCode =
  /** No hay ningún participante en el gasto. */
  | "noParticipants"
  /** Algún monto asignado es negativo. */
  | "amountNegative"
  /** Los montos asignados no suman el total. */
  | "amountMismatch"
  /** Los porcentajes no suman 100. */
  | "percentSum"
  /** Todos los porcentajes están en cero. */
  | "percentZero"
  /** Algún porcentaje es negativo. */
  | "percentNegative"
  /** Todas las partes están en cero. */
  | "sharesZero"
  /** Alguna parte es negativa. */
  | "sharesNegative";

export interface SplitErrorParams {
  /** Suma asignada, en unidades mínimas (`amountMismatch`). */
  assignedMinor?: number;
  /** Total del gasto, en unidades mínimas (`amountMismatch`). */
  totalMinor?: number;
  /** Suma de porcentajes (`percentSum`). */
  sum?: number;
}

/** Error de reparto con código estable y los datos para el mensaje. */
export class SplitError extends Error {
  readonly code: SplitErrorCode;
  readonly params: SplitErrorParams;

  constructor(code: SplitErrorCode, params: SplitErrorParams = {}) {
    // El `message` es el código: útil en logs y tests, nunca se muestra tal cual.
    super(code);
    this.name = "SplitError";
    this.code = code;
    this.params = params;
  }
}

export function isSplitError(e: unknown): e is SplitError {
  return e instanceof SplitError;
}

/**
 * Tolerancia al comparar la suma de porcentajes con 100. Cubre repartos con dos
 * decimales (33,33 + 33,33 + 33,34) y el error de coma flotante de sumarlos,
 * sin llegar a aceptar un 100,1 escrito a mano.
 */
export const PERCENT_TOLERANCE = 0.01;
