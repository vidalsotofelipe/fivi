/**
 * Cálculo del reparto de un gasto (secciones 4, 5 y 26 del documento).
 *
 * Estrategias implementadas:
 *  - `equal`   — partes iguales.
 *  - `amount`  — un monto fijo por participante (deben sumar el total).
 *  - `percent` — un porcentaje por participante (deben sumar 100 %).
 *  - `shares`  — un peso / cantidad de partes por participante (proporcional).
 *
 * `percent` y `shares` NO son lo mismo, aunque ambos terminen repartiendo en
 * proporción: en `shares` sólo importan las proporciones relativas (2-1-1 es un
 * reparto válido), mientras que en `percent` la suma **debe ser 100 %**. Cuando
 * compartían implementación, escribir 60 % + 50 % se aceptaba y se normalizaba a
 * 60/110 y 50/110, que no es lo que la persona pidió.
 *
 * Invariante central en todas: la suma de las porciones es EXACTAMENTE igual al
 * total. El remanente de una división no exacta se reparte de forma
 * determinística (participantes ordenados por id) para que todos los
 * dispositivos obtengan el mismo resultado.
 *
 * Los errores son `SplitError` con código: el texto lo pone la UI.
 */

import type { SplitStrategy } from "./types";
import { distributeByWeights, distributeMinor } from "./money";
import { PERCENT_TOLERANCE, SplitError } from "./splitErrors";

/** Porción asignada a un participante, en unidades mínimas enteras. */
export interface Share {
  participant_id: string;
  share_minor_units: number;
}

function orderedIds(participantIds: string[]): string[] {
  if (participantIds.length === 0) {
    throw new SplitError("noParticipants");
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
      throw new SplitError("amountNegative");
    }
    return { participant_id, share_minor_units: value };
  });
  const sum = shares.reduce((acc, s) => acc + s.share_minor_units, 0);
  if (sum !== totalMinor) {
    throw new SplitError("amountMismatch", {
      assignedMinor: sum,
      totalMinor,
    });
  }
  return shares;
}

/**
 * Reparte el total según un **porcentaje** por participante. La suma debe ser
 * 100 % (con `PERCENT_TOLERANCE` de margen, para permitir 33,33 + 33,33 + 33,34).
 * El reparto monetario sigue siendo exacto: el resto se asigna por Hamilton.
 */
export function splitByPercent(
  totalMinor: number,
  participantIds: string[],
  percents: Record<string, number>,
): Share[] {
  const ordered = orderedIds(participantIds);
  const values = ordered.map((id) => percents[id] ?? 0);

  if (values.some((v) => !Number.isFinite(v) || v < 0)) {
    throw new SplitError("percentNegative");
  }
  const sum = values.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    throw new SplitError("percentZero");
  }
  if (Math.abs(sum - 100) > PERCENT_TOLERANCE) {
    throw new SplitError("percentSum", { sum });
  }

  const amounts = distributeByWeights(totalMinor, values);
  return ordered.map((participant_id, i) => ({
    participant_id,
    share_minor_units: amounts[i]!,
  }));
}

/**
 * Reparte el total en proporción a un peso ("partes") por participante: sólo
 * importan las proporciones relativas, no la escala. 2-1-1 y 4-2-2 reparten
 * igual.
 */
export function splitByWeights(
  totalMinor: number,
  participantIds: string[],
  weights: Record<string, number>,
): Share[] {
  const ordered = orderedIds(participantIds);
  const values = ordered.map((id) => weights[id] ?? 0);

  if (values.some((v) => !Number.isFinite(v) || v < 0)) {
    throw new SplitError("sharesNegative");
  }
  if (values.reduce((a, b) => a + b, 0) <= 0) {
    throw new SplitError("sharesZero");
  }

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
      return splitByPercent(totalMinor, participantIds, strategy.percents);
    case "shares":
      return splitByWeights(totalMinor, participantIds, strategy.shares);
    default: {
      const _exhaustive: never = strategy;
      throw new Error(`Estrategia desconocida: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/**
 * Clave i18n de la etiqueta corta de la estrategia. El dominio no devuelve texto
 * en español: la UI resuelve la clave con `t(...)`.
 */
export function splitStrategyKey(strategy: SplitStrategy): string {
  switch (strategy.kind) {
    case "equal":
      return "expense:splitEqual";
    case "amount":
      return "expense:splitByAmount";
    case "percent":
      return "expense:splitByPercent";
    case "shares":
      return "expense:splitByShares";
  }
}
