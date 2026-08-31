"use client";

/**
 * Hooks reactivos sobre la base local. `useLiveQuery` mantiene la UI viva:
 * cualquier cambio en IndexedDB (propio u originado por sincronización) vuelve
 * a ejecutar la consulta y re-renderiza. Es la base del Optimistic UI: la
 * pantalla lee siempre de local, sin esperar al servidor.
 */

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/data/db";
import {
  getGroupActivity,
  getGroupSummary,
  listGroupsWithTotals,
  type ActivityEvent,
  type GroupListItem,
  type GroupSummary,
} from "@/data/queries";
import * as groupRepo from "@/data/repositories/groupRepo";
import * as participantRepo from "@/data/repositories/participantRepo";
import * as expenseRepo from "@/data/repositories/expenseRepo";
import type {
  Expense,
  ExpenseParticipant,
  Group,
  Participant,
} from "@/domain/types";

/** `undefined` mientras carga. */
export function useGroups(): GroupListItem[] | undefined {
  return useLiveQuery(() => listGroupsWithTotals(db), []);
}

/** `undefined` cargando · `null` no encontrado. */
export function useGroup(groupId: string): Group | null | undefined {
  return useLiveQuery(
    async () => (await groupRepo.getGroup(groupId, db)) ?? null,
    [groupId],
  );
}

export function useParticipants(
  groupId: string,
): Participant[] | undefined {
  return useLiveQuery(
    () => participantRepo.listParticipants(groupId, db),
    [groupId],
  );
}

export function useGroupSummary(
  groupId: string,
): GroupSummary | undefined {
  return useLiveQuery(() => getGroupSummary(groupId, db), [groupId]);
}

export function useExpenses(groupId: string): Expense[] | undefined {
  return useLiveQuery(() => expenseRepo.listExpenses(groupId, db), [groupId]);
}

export function useExpenseWithShares(expenseId: string):
  | { expense: Expense | null; shares: ExpenseParticipant[] }
  | undefined {
  return useLiveQuery(async () => {
    const expense = (await expenseRepo.getExpense(expenseId, db)) ?? null;
    const shares = expense
      ? await expenseRepo.getExpenseShares(expenseId, db)
      : [];
    return { expense, shares };
  }, [expenseId]);
}

export function useGroupHasMovements(groupId: string): boolean | undefined {
  return useLiveQuery(
    () => groupRepo.groupHasMovements(groupId, db),
    [groupId],
  );
}

export function useGroupActivity(
  groupId: string,
): ActivityEvent[] | undefined {
  return useLiveQuery(() => getGroupActivity(groupId, db), [groupId]);
}
