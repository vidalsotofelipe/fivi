import type {
  CurrencyCode,
  Participant,
  ParticipantBalance,
} from "@/domain/types";
import { formatMoney } from "@/domain/money";
import { MoneyText } from "./MoneyText";

export function nameOf(
  participants: Participant[],
  id: string,
): string {
  return participants.find((p) => p.id === id)?.name ?? "—";
}

/** Lista de balances por persona (sección 7). `detailed` agrega pagó/le tocaba. */
export function BalanceList({
  balances,
  participants,
  currency,
  detailed,
}: {
  balances: ParticipantBalance[];
  participants: Participant[];
  currency: CurrencyCode;
  detailed?: boolean;
}) {
  const ordered = [...balances].sort(
    (a, b) => b.balance_minor - a.balance_minor,
  );

  return (
    <ul className="divide-y divide-black/5 dark:divide-white/10">
      {ordered.map((b) => (
        <li
          key={b.participant_id}
          className="flex items-center justify-between gap-3 py-2.5"
        >
          <div className="min-w-0">
            <p className="truncate text-[15px]">
              {nameOf(participants, b.participant_id)}
            </p>
            {detailed ? (
              <p className="text-xs opacity-55">
                Pagó {formatMoney(b.paid_minor, currency)} · le correspondía{" "}
                {formatMoney(b.owed_minor, currency)}
              </p>
            ) : null}
          </div>
          <MoneyText minor={b.balance_minor} currency={currency} signed />
        </li>
      ))}
    </ul>
  );
}
