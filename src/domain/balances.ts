/**
 * Motor de balances (secciones 7 y 35 del documento).
 *
 * Funciones puras: no dependen de React, Dexie ni Supabase. Reciben datos
 * planos y devuelven los balances por participante. Se prueban con unit tests.
 *
 * Modelo:
 *   paid[p]  = gastos que pagó p           + pagos que envió p
 *   owed[p]  = parte de p en los gastos    + pagos que recibió p
 *   balance  = paid - owed
 *     > 0  -> debe recibir dinero
 *     < 0  -> debe pagar dinero
 *     = 0  -> equilibrado
 *
 * Invariante: Σ balance == 0. Si por inconsistencias de redondeo la suma no da
 * cero, el residuo se corrige de forma determinística sobre el participante de
 * menor id.
 */

import type { ParticipantBalance } from "./types";

export interface ExpenseInput {
  id: string;
  paid_by: string;
  amount_minor_units: number;
}

export interface ShareInput {
  expense_id: string;
  participant_id: string;
  share_minor_units: number;
}

export interface PaymentInput {
  from_participant: string;
  to_participant: string;
  amount_minor_units: number;
}

export interface BalancesInput {
  participant_ids: string[];
  expenses: ExpenseInput[];
  shares: ShareInput[];
  payments: PaymentInput[];
}

/** Total gastado por el grupo (sólo gastos, sin pagos). */
export function totalSpentMinor(expenses: ExpenseInput[]): number {
  return expenses.reduce((acc, e) => acc + e.amount_minor_units, 0);
}

export function computeBalances(input: BalancesInput): ParticipantBalance[] {
  const { participant_ids, expenses, shares, payments } = input;

  const ids = [...new Set(participant_ids)].sort((a, b) => a.localeCompare(b));
  const paid = new Map<string, number>(ids.map((id) => [id, 0]));
  const owed = new Map<string, number>(ids.map((id) => [id, 0]));

  const add = (m: Map<string, number>, id: string, amount: number) => {
    if (!m.has(id)) m.set(id, 0);
    m.set(id, (m.get(id) ?? 0) + amount);
  };

  for (const e of expenses) {
    add(paid, e.paid_by, e.amount_minor_units);
  }
  for (const s of shares) {
    add(owed, s.participant_id, s.share_minor_units);
  }
  for (const p of payments) {
    add(paid, p.from_participant, p.amount_minor_units);
    add(owed, p.to_participant, p.amount_minor_units);
  }

  const allIds = [...new Set([...ids, ...paid.keys(), ...owed.keys()])].sort(
    (a, b) => a.localeCompare(b),
  );

  const result: ParticipantBalance[] = allIds.map((id) => {
    const paid_minor = paid.get(id) ?? 0;
    const owed_minor = owed.get(id) ?? 0;
    return {
      participant_id: id,
      paid_minor,
      owed_minor,
      balance_minor: paid_minor - owed_minor,
    };
  });

  // Corrección determinística de residuo por redondeo: Σ balance debe ser 0.
  const residual = result.reduce((acc, b) => acc + b.balance_minor, 0);
  if (residual !== 0 && result.length > 0) {
    const first = result[0]!;
    first.balance_minor -= residual;
    first.owed_minor += residual;
  }

  return result;
}
