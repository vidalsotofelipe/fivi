"use client";

/** Pantallas 08-10 — agregar gasto (wizard 3 pasos) + 11 (toast al guardar). */
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { LinkButton } from "@/components/Button";
import { ExpenseWizard } from "@/components/ExpenseWizard";
import { useToast } from "@/components/ui/toast";
import { useGroupContext } from "@/components/GroupProvider";
import { db } from "@/data/db";
import { useExpenseWithShares } from "@/lib/db-hooks";
import { useLastPayer, rememberLastPayer, useMe } from "@/data/settings";
import { useHydrated } from "@/lib/useHydrated";
import {
  createExpense,
  deleteExpense,
} from "@/data/repositories/expenseRepo";

export default function NewExpensePage() {
  const router = useRouter();
  const params = useSearchParams();
  const { t } = useTranslation(["expense", "common"]);
  const { group, participants } = useGroupContext();
  const hydrated = useHydrated();
  const lastPayer = useLastPayer(group.id);
  const me = useMe(group.id);
  const toast = useToast();

  // "Duplicar": prefill desde un gasto existente (?dup=<id>)
  const dupId = params.get("dup");
  const dup = useExpenseWithShares(dupId ?? "");

  if (participants.length === 0) {
    return (
      <AppShell title={t("expense:addTitle")} back={`/g/${group.id}`} showSync={false}>
        <EmptyState
          title={t("expense:selectParticipants")}
          action={
            <LinkButton href={`/g/${group.id}/personas`}>
              {t("expense:selectParticipants")}
            </LinkButton>
          }
        />
      </AppShell>
    );
  }

  if (
    !hydrated ||
    lastPayer === undefined ||
    me === undefined ||
    (dupId && dup === undefined)
  ) {
    return (
      <AppShell title={t("expense:addTitle")} back={`/g/${group.id}`} showSync={false}>
        <span />
      </AppShell>
    );
  }

  const initial =
    dupId && dup?.expense
      ? {
          description: dup.expense.description,
          amount_minor_units: dup.expense.amount_minor_units,
          paid_by: dup.expense.paid_by,
          participant_ids: dup.shares.map((s) => s.participant_id),
          split_strategy: dup.expense.split_strategy,
        }
      : undefined;

  return (
    <AppShell title={t("expense:addTitle")} back={`/g/${group.id}`} showSync={false}>
      <ExpenseWizard
        groupId={group.id}
        participants={participants}
        currency={group.currency_code}
        initial={initial}
        // Por defecto paga quien está usando el dispositivo (su "yo" en el
        // grupo); si ya cargó gastos antes, se respeta ese último pagador. Sólo
        // si no hay ninguno de los dos cae en el primer participante.
        defaultPayer={lastPayer ?? me ?? undefined}
        submitLabel={t("expense:saveExpense")}
        onSubmit={async (draft) => {
          const { expense } = await createExpense(
            { group_id: group.id, ...draft, created_by: me ?? null },
            db,
          );
          void rememberLastPayer(group.id, draft.paid_by);
          router.replace(`/g/${group.id}`);
          toast({
            message: t("expense:savedToast"),
            actionLabel: t("expense:viewExpense"),
            onAction: () =>
              router.push(`/g/${group.id}/gastos/${expense.id}`),
            undoLabel: t("common:undo"),
            onUndo: () => void deleteExpense(expense.id, db),
            durationMs: 5_000,
          });
        }}
      />
    </AppShell>
  );
}
