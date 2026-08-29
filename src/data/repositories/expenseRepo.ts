/**
 * Repositorio de gastos (secciones 4, 5, 6 del documento).
 *
 * Al crear un gasto se calcula el reparto (`expense_participants`) con el motor
 * de dominio y se guarda todo en una sola transacción. Por defecto la división
 * es equitativa. El gasto usa siempre la moneda del grupo (no se pide moneda
 * por gasto).
 */

import type {
  Expense,
  ExpenseParticipant,
  IsoDate,
  SplitStrategy,
} from "@/domain/types";
import { computeShares } from "@/domain/split";
import { FiviDatabase, db as defaultDb } from "../db";
import {
  createRecord,
  isLive,
  softDeleteRecord,
  updateRecord,
} from "./base";
import { nowIso } from "../ids";

export interface CreateExpenseInput {
  group_id: string;
  description: string;
  /** Total del gasto en unidades mínimas de la moneda del grupo. */
  amount_minor_units: number;
  paid_by: string;
  /** Participantes entre los que se divide. */
  participant_ids: string[];
  expense_date?: IsoDate;
  split_strategy?: SplitStrategy;
}

function todayIso(): IsoDate {
  return nowIso().slice(0, 10);
}

export async function createExpense(
  input: CreateExpenseInput,
  database: FiviDatabase = defaultDb,
): Promise<{ expense: Expense; shares: ExpenseParticipant[] }> {
  const description = input.description.trim();
  if (!description) throw new Error("La descripción del gasto es obligatoria");
  if (!Number.isInteger(input.amount_minor_units) || input.amount_minor_units <= 0) {
    throw new Error("El monto del gasto debe ser un entero positivo");
  }
  if (input.participant_ids.length === 0) {
    throw new Error("El gasto debe dividirse entre al menos un participante");
  }

  const strategy: SplitStrategy = input.split_strategy ?? { kind: "equal" };
  const computed = computeShares(
    input.amount_minor_units,
    input.participant_ids,
    strategy,
  );

  return database.transaction(
    "rw",
    database.expenses,
    database.expense_participants,
    database.sync_queue,
    async () => {
      const expense = await createRecord<Expense>(
        database.expenses,
        "expense",
        {
          group_id: input.group_id,
          description,
          amount_minor_units: input.amount_minor_units,
          paid_by: input.paid_by,
          expense_date: input.expense_date ?? todayIso(),
          split_strategy: strategy,
        },
        database,
      );

      const shares: ExpenseParticipant[] = [];
      for (const s of computed) {
        const row = await createRecord<ExpenseParticipant>(
          database.expense_participants,
          "expense_participant",
          {
            expense_id: expense.id,
            participant_id: s.participant_id,
            share_minor_units: s.share_minor_units,
          },
          database,
        );
        shares.push(row);
      }
      return { expense, shares };
    },
  );
}

export async function listExpenses(
  groupId: string,
  database: FiviDatabase = defaultDb,
): Promise<Expense[]> {
  const rows = await database.expenses
    .where("group_id")
    .equals(groupId)
    .toArray();
  return rows
    .filter(isLive)
    .sort((a, b) => b.expense_date.localeCompare(a.expense_date));
}

export async function getExpense(
  id: string,
  database: FiviDatabase = defaultDb,
): Promise<Expense | undefined> {
  const e = await database.expenses.get(id);
  return e && isLive(e) ? e : undefined;
}

export async function getExpenseShares(
  expenseId: string,
  database: FiviDatabase = defaultDb,
): Promise<ExpenseParticipant[]> {
  const rows = await database.expense_participants
    .where("expense_id")
    .equals(expenseId)
    .toArray();
  return rows.filter(isLive);
}

/** Todas las porciones vivas de los gastos vivos de un grupo. */
export async function listGroupShares(
  groupId: string,
  database: FiviDatabase = defaultDb,
): Promise<ExpenseParticipant[]> {
  const expenses = await listExpenses(groupId, database);
  const ids = new Set(expenses.map((e) => e.id));
  const all = await database.expense_participants.toArray();
  return all.filter((r) => isLive(r) && ids.has(r.expense_id));
}

export async function updateExpenseMeta(
  id: string,
  patch: { description?: string; expense_date?: IsoDate; paid_by?: string },
  database: FiviDatabase = defaultDb,
): Promise<Expense> {
  const next: Record<string, unknown> = {};
  if (patch.description !== undefined) {
    const d = patch.description.trim();
    if (!d) throw new Error("La descripción del gasto es obligatoria");
    next.description = d;
  }
  if (patch.expense_date !== undefined) next.expense_date = patch.expense_date;
  if (patch.paid_by !== undefined) next.paid_by = patch.paid_by;
  return updateRecord<Expense>(
    database.expenses,
    "expense",
    id,
    next as Partial<Omit<Expense, keyof Expense>>,
    database,
  );
}

/**
 * Edición completa de un gasto: actualiza los campos y vuelve a calcular el
 * reparto. Las porciones viejas se marcan como borradas (tombstone) y se crean
 * las nuevas, todo en una transacción.
 */
export async function replaceExpense(
  id: string,
  input: {
    description: string;
    amount_minor_units: number;
    paid_by: string;
    participant_ids: string[];
    expense_date: IsoDate;
    split_strategy?: SplitStrategy;
  },
  database: FiviDatabase = defaultDb,
): Promise<{ expense: Expense; shares: ExpenseParticipant[] }> {
  const description = input.description.trim();
  if (!description) throw new Error("La descripción del gasto es obligatoria");
  if (
    !Number.isInteger(input.amount_minor_units) ||
    input.amount_minor_units <= 0
  ) {
    throw new Error("El monto del gasto debe ser un entero positivo");
  }
  if (input.participant_ids.length === 0) {
    throw new Error("El gasto debe dividirse entre al menos un participante");
  }

  const strategy: SplitStrategy = input.split_strategy ?? { kind: "equal" };
  const computed = computeShares(
    input.amount_minor_units,
    input.participant_ids,
    strategy,
  );

  return database.transaction(
    "rw",
    database.expenses,
    database.expense_participants,
    database.sync_queue,
    async () => {
      const expense = await updateRecord<Expense>(
        database.expenses,
        "expense",
        id,
        {
          description,
          amount_minor_units: input.amount_minor_units,
          paid_by: input.paid_by,
          expense_date: input.expense_date,
          split_strategy: strategy,
        },
        database,
      );

      const previous = await database.expense_participants
        .where("expense_id")
        .equals(id)
        .toArray();
      for (const s of previous.filter(isLive)) {
        await softDeleteRecord<ExpenseParticipant>(
          database.expense_participants,
          "expense_participant",
          s.id,
          database,
        );
      }

      const shares: ExpenseParticipant[] = [];
      for (const s of computed) {
        shares.push(
          await createRecord<ExpenseParticipant>(
            database.expense_participants,
            "expense_participant",
            {
              expense_id: id,
              participant_id: s.participant_id,
              share_minor_units: s.share_minor_units,
            },
            database,
          ),
        );
      }
      return { expense, shares };
    },
  );
}

/** Soft delete del gasto y de todas sus porciones. */
export async function deleteExpense(
  id: string,
  database: FiviDatabase = defaultDb,
): Promise<void> {
  await database.transaction(
    "rw",
    database.expenses,
    database.expense_participants,
    database.sync_queue,
    async () => {
      await softDeleteRecord<Expense>(
        database.expenses,
        "expense",
        id,
        database,
      );
      const shares = await database.expense_participants
        .where("expense_id")
        .equals(id)
        .toArray();
      for (const s of shares.filter(isLive)) {
        await softDeleteRecord<ExpenseParticipant>(
          database.expense_participants,
          "expense_participant",
          s.id,
          database,
        );
      }
    },
  );
}
