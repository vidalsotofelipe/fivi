"use client";

import Link from "next/link";
import type {
  CurrencyCode,
  Participant,
  Transfer,
} from "@/domain/types";
import { MoneyText } from "./MoneyText";
import { nameOf } from "./BalanceList";

/**
 * "Cómo saldar las cuentas" (sección 8). Cada transferencia enlaza a registrar
 * el pago con los datos precargados.
 */
export function TransferList({
  transfers,
  participants,
  currency,
  groupId,
}: {
  transfers: Transfer[];
  participants: Participant[];
  currency: CurrencyCode;
  groupId: string;
}) {
  if (transfers.length === 0) {
    return (
      <p className="rounded-xl bg-black/5 px-4 py-3 text-sm opacity-60 dark:bg-white/5">
        Las cuentas están saldadas.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {transfers.map((t, i) => (
        <li key={`${t.from_id}-${t.to_id}-${i}`}>
          <Link
            href={`/g/${groupId}/pagos/nuevo?from=${t.from_id}&to=${t.to_id}&amount=${t.amount_minor}`}
            className="flex items-center justify-between gap-3 rounded-xl border border-black/10 px-4 py-3 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
          >
            <span className="min-w-0 truncate text-[15px]">
              {nameOf(participants, t.from_id)}{" "}
              <span className="opacity-40">→</span>{" "}
              {nameOf(participants, t.to_id)}
            </span>
            <MoneyText
              minor={t.amount_minor}
              currency={currency}
              className="font-medium tabular-nums"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}
