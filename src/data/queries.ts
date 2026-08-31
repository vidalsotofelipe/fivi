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
import {
  getGroup,
  listGroups,
  type ListGroupsOptions,
} from "./repositories/groupRepo";
import { listParticipants } from "./repositories/participantRepo";
import { listExpenses, listGroupShares } from "./repositories/expenseRepo";
import { listPayments } from "./repositories/paymentRepo";

// --- Actividad del grupo (derivada de timestamps + tombstones) --------------

export type ActivityKind =
  | "expense_created"
  | "expense_updated"
  | "expense_deleted"
  | "payment_created"
  | "person_added";

export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  /** ISO del momento del evento (para ordenar y mostrar). */
  at: string;
  /** ids de participantes relacionados (para el filtro por persona). */
  people: string[];
  /** Datos para interpolar el texto: nombre/descr., from/to, etc. */
  name?: string;
  from_id?: string;
  to_id?: string;
  actor_id?: string;
  /** id del gasto para enlazar, si aplica. */
  expense_id?: string;
  amount_minor?: number;
}

/**
 * Reconstruye una línea de tiempo del grupo a partir de los `created_at` /
 * `updated_at` / `deleted_at` que ya existen. No hay tabla de historial: los
 * eventos de edición sólo indican que hubo una edición y cuándo.
 */
export async function getGroupActivity(
  groupId: string,
  database: FiviDatabase = defaultDb,
): Promise<ActivityEvent[]> {
  const [expenses, payments, participants] = await Promise.all([
    database.expenses.where("group_id").equals(groupId).toArray(),
    database.payments.where("group_id").equals(groupId).toArray(),
    database.participants.where("group_id").equals(groupId).toArray(),
  ]);

  const events: ActivityEvent[] = [];

  for (const e of expenses) {
    events.push({
      id: `${e.id}:created`,
      kind: "expense_created",
      at: e.created_at,
      people: [e.paid_by],
      name: e.description,
      actor_id: e.paid_by,
      expense_id: e.id,
      amount_minor: e.amount_minor_units,
    });
    if (e.deleted_at) {
      events.push({
        id: `${e.id}:deleted`,
        kind: "expense_deleted",
        at: e.deleted_at,
        people: [e.paid_by],
        name: e.description,
        actor_id: e.paid_by,
      });
    } else if (e.version > 1) {
      // `version` sube en cada edición local (ver repositories/base.ts). No hay
      // historial, así que sólo se sabe que hubo una última edición y cuándo.
      events.push({
        id: `${e.id}:updated`,
        kind: "expense_updated",
        at: e.updated_at,
        people: [e.paid_by],
        name: e.description,
        actor_id: e.paid_by,
        expense_id: e.id,
      });
    }
  }

  for (const p of payments) {
    if (p.deleted_at) continue;
    events.push({
      id: `${p.id}:created`,
      kind: "payment_created",
      at: p.created_at,
      people: [p.from_participant, p.to_participant],
      from_id: p.from_participant,
      to_id: p.to_participant,
      amount_minor: p.amount_minor_units,
    });
  }

  for (const p of participants) {
    if (p.deleted_at) continue;
    events.push({
      id: `${p.id}:added`,
      kind: "person_added",
      at: p.created_at,
      people: [p.id],
      name: p.name,
    });
  }

  return events.sort((a, b) => b.at.localeCompare(a.at));
}

export interface PastExpensePick {
  expense: Expense;
  /** ids de participantes que hoy tiene el gasto. */
  current_participant_ids: string[];
  current_participant_names: string[];
  /** true si el gasto ya incluye a TODOS los demás participantes vivos del grupo. */
  includes_all_others: boolean;
}

/**
 * Gastos de división equitativa del grupo en los que `participantId` todavía no
 * está. Se usa para preguntar, al sumar a alguien, en qué gastos anteriores
 * corresponde tenerlo en cuenta.
 */
export async function listPastEqualExpensesFor(
  groupId: string,
  participantId: string,
  database: FiviDatabase = defaultDb,
): Promise<PastExpensePick[]> {
  const [participants, expenses, shares] = await Promise.all([
    listParticipants(groupId, database),
    listExpenses(groupId, database),
    listGroupShares(groupId, database),
  ]);

  const nameById = new Map(participants.map((p) => [p.id, p.name]));
  const otherIds = participants
    .map((p) => p.id)
    .filter((id) => id !== participantId);

  const sharesByExpense = new Map<string, string[]>();
  for (const s of shares) {
    const list = sharesByExpense.get(s.expense_id) ?? [];
    list.push(s.participant_id);
    sharesByExpense.set(s.expense_id, list);
  }

  const out: PastExpensePick[] = [];
  for (const expense of expenses) {
    if (expense.split_strategy.kind !== "equal") continue;
    const ids = sharesByExpense.get(expense.id) ?? [];
    if (ids.includes(participantId)) continue;
    out.push({
      expense,
      current_participant_ids: ids,
      current_participant_names: ids.map((id) => nameById.get(id) ?? "—"),
      includes_all_others:
        otherIds.length > 0 && otherIds.every((id) => ids.includes(id)),
    });
  }
  return out;
}

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
  options: ListGroupsOptions = {},
): Promise<GroupListItem[]> {
  const groups = await listGroups(database, options);
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
