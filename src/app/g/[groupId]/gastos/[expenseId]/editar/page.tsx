"use client";

/** Editar gasto — mismo wizard de 3 pasos, precargado. */
import { useParams, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { EmptyState, Loading } from "@/components/EmptyState";
import { LinkButton } from "@/components/Button";
import { ExpenseWizard } from "@/components/ExpenseWizard";
import { useToast } from "@/components/ui/toast";
import { useGroupContext } from "@/components/GroupProvider";
import { db } from "@/data/db";
import { replaceExpense } from "@/data/repositories/expenseRepo";
import { rememberLastPayer } from "@/data/settings";
import { useExpenseWithShares } from "@/lib/db-hooks";
import { useHydrated } from "@/lib/useHydrated";

export default function EditExpensePage() {
  const router = useRouter();
  const { t } = useTranslation(["expense", "common"]);
  const { group, participants } = useGroupContext();
  const { expenseId } = useParams<{ expenseId: string }>();
  const hydrated = useHydrated();
  const data = useExpenseWithShares(expenseId);
  const toast = useToast();

  const back = `/g/${group.id}/gastos/${expenseId}`;

  if (!hydrated || data === undefined) {
    return (
      <AppShell title={t("expense:editTitle")} back={back} showSync={false}>
        <Loading />
      </AppShell>
    );
  }

  if (data.expense === null) {
    return (
      <AppShell title={t("expense:editTitle")} back={back} showSync={false}>
        <EmptyState
          title={t("expense:noResults")}
          action={
            <LinkButton href={`/g/${group.id}/gastos`}>
              {t("expense:listTitle")}
            </LinkButton>
          }
        />
      </AppShell>
    );
  }

  const e = data.expense;

  return (
    <AppShell title={t("expense:editTitle")} back={back} showSync={false}>
      <ExpenseWizard
        groupId={group.id}
        participants={participants}
        currency={group.currency_code}
        initial={{
          description: e.description,
          amount_minor_units: e.amount_minor_units,
          paid_by: e.paid_by,
          participant_ids: data.shares.map((s) => s.participant_id),
          expense_date: e.expense_date,
          split_strategy: e.split_strategy,
        }}
        submitLabel={t("common:save")}
        onSubmit={async (draft) => {
          await replaceExpense(e.id, draft, db);
          void rememberLastPayer(group.id, draft.paid_by);
          router.replace(back);
          toast({ message: t("expense:savedToast") });
        }}
      />
    </AppShell>
  );
}
