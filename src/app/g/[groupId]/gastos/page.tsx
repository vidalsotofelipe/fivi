"use client";

/** Historial de gastos (sección 6). */
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { LinkButton } from "@/components/Button";
import { EmptyState, Loading } from "@/components/EmptyState";
import { MoneyText } from "@/components/MoneyText";
import { nameOf } from "@/components/BalanceList";
import { useGroupContext } from "@/components/GroupProvider";
import { useExpenses } from "@/lib/db-hooks";
import { formatDate } from "@/lib/format";

export default function ExpenseHistoryPage() {
  const { group, participants } = useGroupContext();
  const expenses = useExpenses(group.id);

  return (
    <AppShell title="Historial" back={`/g/${group.id}`}>
      {expenses === undefined ? (
        <Loading />
      ) : expenses.length === 0 ? (
        <EmptyState
          title="Sin gastos todavía"
          action={
            <LinkButton href={`/g/${group.id}/gastos/nuevo`}>
              Agregar gasto
            </LinkButton>
          }
        />
      ) : (
        <>
          <ul className="divide-y divide-black/5 dark:divide-white/10">
            {expenses.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/g/${group.id}/gastos/${e.id}`}
                  className="flex items-center justify-between gap-3 py-3 hover:opacity-70"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[15px]">{e.description}</p>
                    <p className="text-xs opacity-55">
                      {formatDate(e.expense_date)} · pagó{" "}
                      {nameOf(participants, e.paid_by)}
                    </p>
                  </div>
                  <MoneyText
                    minor={e.amount_minor_units}
                    currency={group.currency_code}
                    className="shrink-0 tabular-nums"
                  />
                </Link>
              </li>
            ))}
          </ul>
          <LinkButton
            href={`/g/${group.id}/gastos/nuevo`}
            full
            variant="secondary"
          >
            Agregar gasto
          </LinkButton>
        </>
      )}
    </AppShell>
  );
}
