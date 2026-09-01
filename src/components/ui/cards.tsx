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
import type { ActivityEvent } from "@/data/queries";
import { cn } from "@/lib/cn";
import { formatDate, formatRelative } from "@/lib/format";
import { useLocale } from "@/components/LocaleProvider";
import { Money } from "@/components/Money";

export function nameOf(participants: Participant[], id: string): string {
  return participants.find((p) => p.id === id)?.name ?? "—";
}

/** Fila enlazable (gasto / persona / transferencia / actividad). */
const ROW =
  "flex items-center justify-between gap-3 border-2 border-border bg-surface px-4 py-3";
const ROW_LINK = cn(ROW, "hover:border-accent hover:bg-accent-weak");

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
    <section className="border-2 border-border-strong bg-surface p-5 text-center">
      <p className="label-caps">{caption}</p>
      <p className="mt-2 text-[40px] leading-none">
        <Money
          minor={amountMinor}
          currency={currency}
          signed={amountMinor !== 0}
        />
      </p>
      <p className="mt-2 label-caps">{statusLabel}</p>
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
        "flex items-center justify-between gap-3 border-t-2 border-border py-3",
        highlight && "border-accent",
      )}
    >
      <span className="min-w-0">
        <span className="block truncate text-[15px] text-text">
          {nameOf(participants, balance.participant_id)}
        </span>
        <span className="mt-0.5 block label-caps">{status}</span>
      </span>
      <Money minor={balance.balance_minor} currency={currency} signed />
    </li>
  );
}

/** "X le paga a Y  $monto" con dirección inequívoca (nombres, no sólo color). */
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
        className={ROW_LINK}
      >
        <span className="min-w-0 text-[15px] text-text">
          {t("paysTo", { from, to })}
        </span>
        <Money
          minor={transfer.amount_minor}
          currency={currency}
          className="shrink-0 font-bold"
        />
      </Link>
    </li>
  );
}

/** Fila de persona en la lista de Personas: nombre + estado + saldo. */
export function PersonRow({
  participant,
  balanceMinor,
  currency,
  groupId,
}: {
  participant: Participant;
  balanceMinor: number;
  currency: CurrencyCode;
  groupId: string;
}) {
  const { t } = useTranslation("people");
  const status =
    balanceMinor > 0
      ? t("statusReceives")
      : balanceMinor < 0
        ? t("statusOwes")
        : t("statusSettled");
  return (
    <li>
      <Link
        href={`/g/${groupId}/personas/${participant.id}`}
        className={ROW_LINK}
      >
        <span className="min-w-0">
          <span className="block truncate text-[15px] text-text">
            {participant.name}
          </span>
          <span className="mt-0.5 block label-caps">{status}</span>
        </span>
        <Money minor={balanceMinor} currency={currency} signed />
      </Link>
    </li>
  );
}

/** Un evento de la línea de tiempo de actividad (sección 15). */
export function ActivityItem({
  event,
  participants,
  currency,
  groupId,
}: {
  event: ActivityEvent;
  participants: Participant[];
  currency: CurrencyCode;
  groupId: string;
}) {
  const { t } = useTranslation(["activity", "expense"]);
  const { lang } = useLocale();
  const actor = event.actor_id
    ? nameOf(participants, event.actor_id)
    : t("activity:someone");

  let text: string;
  switch (event.kind) {
    case "expense_created":
      text = t("activity:expenseCreated", { actor, name: event.name });
      break;
    case "expense_updated":
      text = t("activity:expenseUpdated", { actor, name: event.name });
      break;
    case "expense_deleted":
      text = t("activity:expenseDeleted", { actor, name: event.name });
      break;
    case "payment_created":
      text = t("activity:paymentCreated", {
        from: nameOf(participants, event.from_id ?? ""),
        to: nameOf(participants, event.to_id ?? ""),
      });
      break;
    case "person_added":
      text = t("activity:personAdded", { name: event.name });
      break;
  }

  const body = (
    <span className="min-w-0 text-[15px] text-text">
      {text}
      <span className="mt-0.5 block text-xs text-muted">
        {formatRelative(event.at, lang)}
        {event.amount_minor != null ? (
          <>
            {" · "}
            <Money minor={event.amount_minor} currency={currency} />
          </>
        ) : null}
      </span>
    </span>
  );

  if (event.expense_id) {
    return (
      <li>
        <Link
          href={`/g/${groupId}/gastos/${event.expense_id}`}
          className={ROW_LINK}
        >
          {body}
        </Link>
      </li>
    );
  }
  return <li className={ROW}>{body}</li>;
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
      <Link href={`/g/${groupId}/gastos/${expense.id}`} className={ROW_LINK}>
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-medium text-text">
            {expense.description}
          </span>
          <span className="mt-0.5 block text-xs text-muted">
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
