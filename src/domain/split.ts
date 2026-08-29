/**
 * Cálculo del reparto de un gasto (secciones 4, 5 y 26 del documento).
 *
 * Estrategias implementadas:
 *  - `equal`   — partes iguales.
 *  - `amount`  — un monto fijo por participante (deben sumar el total).
 *  - `percent` — un porcentaje por participante.
 *  - `shares`  — un peso / cantidad de partes por participante.
 *
 * Invariante central en todas: la suma de las porciones es EXACTAMENTE igual al
 * total. El remanente de una división no exacta se reparte de forma
 * determinística (participantes ordenados por id) para que todos los
 * dispositivos obtengan el mismo resultado.
 */

import type { SplitStrategy } from "./types";
import { distributeByWeights, distributeMinor } from "./money";

/** Porción asignada a un participante, en unidades mínimas enteras. */
export interface Share {
  participant_id: string;
  share_minor_units: number;
}

function orderedIds(participantIds: string[]): string[] {
  if (participantIds.length === 0) {
    throw new Error("El gasto debe dividirse entre al menos un participante");
  }
  return [...participantIds].sort((a, b) => a.localeCompare(b));
}

/** Divide `totalMinor` en partes iguales entre `participantIds`. */
export function splitEqually(
  totalMinor: number,
  participantIds: string[],
): Share[] {
  const ordered = orderedIds(participantIds);
  const amounts = distributeMinor(totalMinor, ordered.length);
  return ordered.map((participant_id, i) => ({
    participant_id,
    share_minor_units: amounts[i]!,
  }));
}

/**
 * Cada participante asume un monto fijo (en unidades mínimas). Los montos deben
 * sumar exactamente el total del gasto.
 */
export function splitByAmounts(
  totalMinor: number,
  participantIds: string[],
  amounts: Record<string, number>,
): Share[] {
  const ordered = orderedIds(participantIds);
  const shares = ordered.map((participant_id) => {
    const value = Math.round(amounts[participant_id] ?? 0);
    if (value < 0) {
      throw new Error("Los montos asignados no pueden ser negativos");
    }
    return { participant_id, share_minor_units: value };
  });
  const sum = shares.reduce((acc, s) => acc + s.share_minor_units, 0);
  if (sum !== totalMinor) {
    throw new Error(
      `Los montos asignados no suman el total del gasto (asignado ${sum}, total ${totalMinor})`,
    );
  }
  return shares;
}

/**
 * Reparte el total en proporción a un peso por participante. Se usa tanto para
 * porcentajes como para "partes" / cantidades: sólo importan las proporciones
 * relativas, no la escala.
 */
export function splitByWeights(
  totalMinor: number,
  participantIds: string[],
  weights: Record<string, number>,
): Share[] {
  const ordered = orderedIds(participantIds);
  const values = ordered.map((id) => weights[id] ?? 0);
  const amounts = distributeByWeights(totalMinor, values);
  return ordered.map((participant_id, i) => ({
    participant_id,
    share_minor_units: amounts[i]!,
  }));
}

/** Resuelve el reparto según la estrategia del gasto. */
export function computeShares(
  totalMinor: number,
  participantIds: string[],
  strategy: SplitStrategy,
): Share[] {
  switch (strategy.kind) {
    case "equal":
      return splitEqually(totalMinor, participantIds);
    case "amount":
      return splitByAmounts(totalMinor, participantIds, strategy.amounts);
    case "percent":
      return splitByWeights(totalMinor, participantIds, strategy.percents);
    case "shares":
      return splitByWeights(totalMinor, participantIds, strategy.shares);
    default: {
      const _exhaustive: never = strategy;
      throw new Error(`Estrategia desconocida: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/** Etiqueta corta para mostrar en la UI. */
export function splitStrategyLabel(strategy: SplitStrategy): string {
  switch (strategy.kind) {
    case "equal":
      return "Partes iguales";
    case "amount":
      return "Montos personalizados";
    case "percent":
      return "Porcentajes";
    case "shares":
      return "Partes";
  }
}
