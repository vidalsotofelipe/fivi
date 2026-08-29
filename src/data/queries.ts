/**
 * Consultas de lectura que combinan repos + motor de dominio.
 *
 * La UI usa estas funciones para pintar el resumen del grupo (sección 10), el
 * balance por persona (sección 7) y "cómo saldar las cuentas" (sección 8).
 * Todo el cálculo ocurre localmente; no se depende del servidor.
 */

import type {
  Expense,
  Group,
  Participant,
  ParticipantBalance,
  Payment,
  Transfer,
} from "@/domain/types";
import { computeBalances, totalSpentMinor } from "@/domain/balances";
import { simplifyDebts } from "@/domain/settlement";
import { FiviDatabase, db as defaultDb } from "./db";
import { getGroup, listGroups } from "./repositories/groupRepo";
import { listParticipants } from "./repositories/participantRepo";
import { listExpenses, listGroupShares } from "./repositories/expenseRepo";
import { listPayments } from "./repositories/paymentRepo";

export interface GroupSummary {
  group: Group;
  participants: Participant[];
  total_spent_minor: number;
  balances: ParticipantBalance[];
  transfers: Transfer[];
  recent: Array<
    | { type: "expense"; date: string; data: Expense }
    | { type: "payment"; date: string; data: Payment }
  >;
}

export interface GroupListItem {
  group: Group;
  total_spent_minor: number;
  participant_count: number;
}

/** Grupos vivos con su total gastado, para la pantalla inicial (sección 28). */
export async function listGroupsWithTotals(
  database: FiviDatabase = defaultDb,
): Promise<GroupListItem[]> {
  const groups = await listGroups(database);
  return Promise.all(
    groups.map(async (group) => {
      const [expenses, participants] = await Promise.all([
        listExpenses(group.id, database),
        listParticipants(group.id, database),
      ]);
      return {
        group,
        total_spent_minor: totalSpentMinor(
          expenses.map((e) => ({
            id: e.id,
            paid_by: e.paid_by,
            amount_minor_units: e.amount_minor_units,
          })),
        ),
        participant_count: participants.length,
      };
    }),
  );
}

export async function getGroupSummary(
  groupId: string,
  database: FiviDatabase = defaultDb,
  recentLimit = 10,
): Promise<GroupSummary> {
  const group = await getGroup(groupId, database);
  if (!group) throw new Error(`No existe el grupo ${groupId}`);

  const [participants, expenses, shares, payments] = await Promise.all([
    listParticipants(groupId, database),
    listExpenses(groupId, database),
    listGroupShares(groupId, database),
    listPayments(groupId, database),
  ]);

  const balances = computeBalances({
    participant_ids: participants.map((p) => p.id),
    expenses: expenses.map((e) => ({
      id: e.id,
      paid_by: e.paid_by,
      amount_minor_units: e.amount_minor_units,
    })),
    shares: shares.map((s) => ({
      expense_id: s.expense_id,
      participant_id: s.participant_id,
      share_minor_units: s.share_minor_units,
    })),
    payments: payments.map((p) => ({
      from_participant: p.from_participant,
      to_participant: p.to_participant,
      amount_minor_units: p.amount_minor_units,
    })),
  });

  const transfers = simplifyDebts(balances);

  const recent = [
    ...expenses.map((e) => ({
      type: "expense" as const,
      date: e.expense_date,
      data: e,
    })),
    ...payments.map((p) => ({
      type: "payment" as const,
      date: p.payment_date,
      data: p,
    })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, recentLimit);

  return {
    group,
    participants,
    total_spent_minor: totalSpentMinor(
      expenses.map((e) => ({
        id: e.id,
        paid_by: e.paid_by,
        amount_minor_units: e.amount_minor_units,
      })),
    ),
    balances,
    transfers,
    recent,
  };
}
