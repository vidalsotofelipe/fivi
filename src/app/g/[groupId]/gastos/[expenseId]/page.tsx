"use client";

/** Detalle / editar / eliminar gasto (sección 6). */
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button, LinkButton } from "@/components/Button";
import { EmptyState, Loading } from "@/components/EmptyState";
import { ExpenseForm } from "@/components/ExpenseForm";
import { MoneyText } from "@/components/MoneyText";
import { nameOf } from "@/components/BalanceList";
import { useGroupContext } from "@/components/GroupProvider";
import { useExpenseWithShares } from "@/lib/db-hooks";
import { db } from "@/data/db";
import { deleteExpense, replaceExpense } from "@/data/repositories/expenseRepo";
import { formatMoney } from "@/domain/money";
import { splitStrategyLabel } from "@/domain/split";
import { formatDate } from "@/lib/format";

export default function ExpenseDetailPage() {
  const router = useRouter();
  const { group, participants } = useGroupContext();
  const { expenseId } = useParams<{ expenseId: string }>();
  const data = useExpenseWithShares(expenseId);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const cc = group.currency_code;

  if (data === undefined) {
    return (
      <AppShell title="Gasto" back={`/g/${group.id}/gastos`}>
        <Loading />
      </AppShell>
    );
  }

  if (data.expense === null) {
    return (
      <AppShell title="Gasto" back={`/g/${group.id}/gastos`}>
        <EmptyState
          title="Este gasto no existe o fue eliminado"
          action={
            <LinkButton href={`/g/${group.id}/gastos`}>
              Volver al historial
            </LinkButton>
          }
        />
      </AppShell>
    );
  }

  const expense = data.expense;

  if (editing) {
    return (
      <AppShell title="Editar gasto" back={`/g/${group.id}/gastos`}>
        <ExpenseForm
          currency={cc}
          participants={participants}
          submitLabel="Guardar cambios"
          initial={{
            description: expense.description,
            amount_minor_units: expense.amount_minor_units,
            paid_by: expense.paid_by,
            participant_ids: data.shares.map((s) => s.participant_id),
            expense_date: expense.expense_date,
            split_strategy: expense.split_strategy,
          }}
          onSubmit={async (values) => {
            await replaceExpense(expense.id, values, db);
            setEditing(false);
          }}
        />
      </AppShell>
    );
  }

  return (
    <AppShell title={expense.description} back={`/g/${group.id}/gastos`}>
      <section className="rounded-2xl border border-black/10 p-4 dark:border-white/10">
        <p className="text-3xl font-semibold tabular-nums">
          {formatMoney(expense.amount_minor_units, cc)}
        </p>
        <p className="mt-1 text-sm opacity-60">
          {formatDate(expense.expense_date)} · pagó{" "}
          {nameOf(participants, expense.paid_by)}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium opacity-60">
          Dividido entre ({data.shares.length}) ·{" "}
          {splitStrategyLabel(expense.split_strategy)}
        </h2>
        <ul className="divide-y divide-black/5 dark:divide-white/10">
          {data.shares.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between py-2.5 text-[15px]"
            >
              <span>{nameOf(participants, s.participant_id)}</span>
              <MoneyText
                minor={s.share_minor_units}
                currency={cc}
                className="tabular-nums"
              />
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-2 flex flex-col gap-2">
        <Button variant="secondary" full onClick={() => setEditing(true)}>
          Editar gasto
        </Button>
        {confirming ? (
          <div className="flex flex-col gap-2 rounded-xl border border-red-500/30 p-3">
            <p className="text-sm">¿Eliminar este gasto?</p>
            <div className="flex gap-2">
              <Button
                variant="danger"
                full
                onClick={async () => {
                  await deleteExpense(expense.id, db);
                  router.replace(`/g/${group.id}/gastos`);
                }}
              >
                Eliminar
              </Button>
              <Button
                variant="ghost"
                full
                onClick={() => setConfirming(false)}
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="ghost"
            full
            className="text-red-600"
            onClick={() => setConfirming(true)}
          >
            Eliminar gasto
          </Button>
        )}
      </div>
    </AppShell>
  );
}
