/**
 * Cálculo del reparto de un gasto (secciones 4, 5 y 26 del documento).
 *
 * Para el MVP sólo se implementa la división equitativa. La firma acepta una
 * `SplitStrategy` para dejar el punto de extensión, pero las estrategias no
 * equitativas lanzan `NotImplementedError` por ahora.
 *
 * Invariante central: la suma de las porciones es EXACTAMENTE igual al total.
 * El remanente de una división no exacta se asigna de forma determinística a
 * los participantes ordenados por id, de modo que todos los dispositivos
 * obtengan el mismo resultado.
 */

import type { SplitStrategy } from "./types";
import { distributeMinor } from "./money";

export class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotImplementedError";
  }
}

/** Porción asignada a un participante, en unidades mínimas enteras. */
export interface Share {
  participant_id: string;
  share_minor_units: number;
}

/**
 * Divide `totalMinor` en partes iguales entre `participantIds`.
 * Los ids se ordenan antes de repartir para que el reparto del remanente sea
 * estable y reproducible.
 */
export function splitEqually(
  totalMinor: number,
  participantIds: string[],
): Share[] {
  if (participantIds.length === 0) {
    throw new Error("splitEqually requiere al menos un participante");
  }
  const ordered = [...participantIds].sort((a, b) => a.localeCompare(b));
  const amounts = distributeMinor(totalMinor, ordered.length);
  return ordered.map((participant_id, i) => ({
    participant_id,
    share_minor_units: amounts[i]!,
  }));
}

/**
 * Punto de entrada genérico. Resuelve el reparto según la estrategia del gasto.
 * Hoy sólo `equal`; el resto queda preparado para una versión futura.
 */
export function computeShares(
  totalMinor: number,
  participantIds: string[],
  strategy: SplitStrategy,
): Share[] {
  switch (strategy.kind) {
    case "equal":
      return splitEqually(totalMinor, participantIds);
    case "amount":
    case "percent":
    case "shares":
      throw new NotImplementedError(
        `La estrategia de división "${strategy.kind}" todavía no está implementada`,
      );
    default: {
      const _exhaustive: never = strategy;
      throw new Error(`Estrategia desconocida: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
