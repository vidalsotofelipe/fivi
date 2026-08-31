"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import type {
  CurrencyCode,
  Expense,
  Participant,
  ParticipantBalance,
  Transfer,
} from "@/domain/types";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { useLocale } from "@/components/LocaleProvider";
import { Money } from "@/components/Money";

export function nameOf(participants: Participant[], id: string): string {
  return participants.find((p) => p.id === id)?.name ?? "—";
}

/** Tarjeta grande "Tu balance" / "Total gastado" del resumen. */
export function BalanceCard({
  amountMinor,
  currency,
  caption,
  statusLabel,
}: {
  amountMinor: number;
  currency: CurrencyCode;
  caption: string;
  statusLabel: string;
}) {
  return (
    <section className="rounded-md border border-border bg-surface-raised p-5 text-center">
      <p className="text-xs uppercase tracking-wide text-muted">{caption}</p>
      <p className="mt-1 text-3xl font-semibold">
        <Money minor={amountMinor} currency={currency} signed={amountMinor !== 0} />
      </p>
      <p className="mt-1 text-sm text-muted">{statusLabel}</p>
    </section>
  );
}

/** Fila de balance por persona (nombre + estado + monto con signo). */
export function BalanceRow({
  balance,
  participants,
  currency,
  highlight,
}: {
  balance: ParticipantBalance;
  participants: Participant[];
  currency: CurrencyCode;
  highlight?: boolean;
}) {
  const { t } = useTranslation("people");
  const status =
    balance.balance_minor > 0
      ? t("statusReceives")
      : balance.balance_minor < 0
        ? t("statusOwes")
        : t("statusSettled");
  return (
    <li
      className={cn(
        "flex items-center justify-between gap-3 py-2.5",
        highlight && "font-medium",
      )}
    >
      <span className="min-w-0">
        <span className="block truncate text-[15px] text-text">
          {nameOf(participants, balance.participant_id)}
        </span>
        <span className="block text-xs text-muted">{status}</span>
      </span>
      <Money minor={balance.balance_minor} currency={currency} signed />
    </li>
  );
}

/** "X → Y  $monto" con dirección inequívoca (flecha + nombres, no sólo color). */
export function TransferRow({
  transfer,
  participants,
  currency,
  groupId,
}: {
  transfer: Transfer;
  participants: Participant[];
  currency: CurrencyCode;
  groupId: string;
}) {
  const { t } = useTranslation("payment");
  const from = nameOf(participants, transfer.from_id);
  const to = nameOf(participants, transfer.to_id);
  return (
    <li>
      <Link
        href={`/g/${groupId}/pagos/nuevo?from=${transfer.from_id}&to=${transfer.to_id}&amount=${transfer.amount_minor}`}
        className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface px-4 py-3 hover:bg-text/[0.03]"
      >
        <span className="min-w-0 text-[15px] text-text">
          {t("paysTo", { from, to })}
        </span>
        <Money
          minor={transfer.amount_minor}
          currency={currency}
          className="shrink-0 font-medium"
        />
      </Link>
    </li>
  );
}

/** Tarjeta de gasto en la lista / actividad. */
export function ExpenseCard({
  expense,
  participants,
  currency,
  groupId,
}: {
  expense: Expense;
  participants: Participant[];
  currency: CurrencyCode;
  groupId: string;
}) {
  const { t } = useTranslation(["expense"]);
  const { lang } = useLocale();
  const payer = nameOf(participants, expense.paid_by);
  return (
    <li>
      <Link
        href={`/g/${groupId}/gastos/${expense.id}`}
        className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface px-4 py-3 hover:bg-text/[0.03]"
      >
        <span className="min-w-0">
          <span className="block truncate text-[15px] text-text">
            {expense.description}
          </span>
          <span className="block text-xs text-muted">
            {formatDate(expense.expense_date, lang)} ·{" "}
            {t("expense:paidBy", { name: payer })}
          </span>
        </span>
        <Money
          minor={expense.amount_minor_units}
          currency={currency}
          className="shrink-0"
        />
      </Link>
    </li>
  );
}
