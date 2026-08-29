/**
 * Simplificación de deudas (secciones 8 y 35 del documento).
 *
 * Transforma los balances individuales en una cantidad reducida de
 * transferencias ("quién le paga a quién y cuánto") para saldar el grupo.
 *
 * Algoritmo greedy: se emparejan el mayor acreedor y el mayor deudor, se
 * transfiere el mínimo de ambos en valor absoluto, y se repite. Produce como
 * máximo n-1 transferencias. Todo en enteros de unidad mínima. El orden de
 * desempate es por id para que el resultado sea idéntico en todos los
 * dispositivos.
 */

import type { ParticipantBalance, Transfer } from "./types";

interface Entry {
  id: string;
  amount: number; // > 0 acreedor, < 0 deudor
}

export function simplifyDebts(balances: ParticipantBalance[]): Transfer[] {
  const creditors: Entry[] = [];
  const debtors: Entry[] = [];

  for (const b of balances) {
    if (b.balance_minor > 0) {
      creditors.push({ id: b.participant_id, amount: b.balance_minor });
    } else if (b.balance_minor < 0) {
      debtors.push({ id: b.participant_id, amount: b.balance_minor });
    }
  }

  // Mayor acreedor primero; desempate por id ascendente.
  creditors.sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));
  // Mayor deudor (más negativo) primero; desempate por id ascendente.
  debtors.sort((a, b) => a.amount - b.amount || a.id.localeCompare(b.id));

  const transfers: Transfer[] = [];
  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci]!;
    const debtor = debtors[di]!;
    const amount = Math.min(creditor.amount, -debtor.amount);

    if (amount > 0) {
      transfers.push({
        from_id: debtor.id,
        to_id: creditor.id,
        amount_minor: amount,
      });
      creditor.amount -= amount;
      debtor.amount += amount;
    }

    if (creditor.amount === 0) ci++;
    if (debtor.amount === 0) di++;
  }

  return transfers;
}
