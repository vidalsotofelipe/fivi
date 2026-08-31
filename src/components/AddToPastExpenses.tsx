"use client";

import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/data/db";
import { listPastEqualExpensesFor } from "@/data/queries";
import { addParticipantToExpenses } from "@/data/repositories/expenseRepo";
import { formatMoney } from "@/domain/money";
import type { CurrencyCode, Participant } from "@/domain/types";
import { formatDate } from "@/lib/format";
import { Button } from "./Button";

/**
 * Al sumar un participante nuevo, pregunta en qué gastos ya registrados
 * corresponde tenerlo en cuenta y rehace el reparto de los elegidos.
 * Sólo aplica a gastos de división equitativa.
 *
 * Si no hay gastos anteriores donde sumarlo, se descarta solo (no muestra nada).
 */
export function AddToPastExpenses({
  groupId,
  participant,
  currency,
  onDone,
}: {
  groupId: string;
  participant: Participant;
  currency: CurrencyCode;
  onDone: () => void;
}) {
  const picks = useLiveQuery(
    () => listPastEqualExpensesFor(groupId, participant.id, db),
    [groupId, participant.id],
  );

  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState(false);

  // Pre-selecciona los gastos que hoy incluyen a todo el grupo.
  useEffect(() => {
    if (picks && selected === null) {
      setSelected(
        new Set(
          picks.filter((p) => p.includes_all_others).map((p) => p.expense.id),
        ),
      );
    }
  }, [picks, selected]);

  // Nada donde sumarlo: cerrar sin molestar.
  useEffect(() => {
    if (picks && picks.length === 0) onDone();
  }, [picks, onDone]);

  const checkedIds = useMemo(
    () => (selected ? [...selected] : []),
    [selected],
  );

  if (!picks || picks.length === 0 || selected === null) return null;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function confirm() {
    setBusy(true);
    try {
      await addParticipantToExpenses(participant.id, checkedIds, db);
    } finally {
      setBusy(false);
      onDone();
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-black/15 p-3 dark:border-white/15">
      <p className="text-sm font-medium">
        ¿Sumar a {participant.name} a gastos ya registrados?
      </p>
      <p className="text-xs opacity-60">
        Se recalcula el reparto de los que elijas. Los gastos con división
        personalizada no se listan acá.
      </p>

      <ul className="flex flex-col divide-y divide-black/5 dark:divide-white/10">
        {picks.map(({ expense, current_participant_names }) => {
          const on = selected.has(expense.id);
          return (
            <li key={expense.id}>
              <button
                type="button"
                onClick={() => toggle(expense.id)}
                className="flex w-full items-start gap-3 py-2.5 text-left"
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${
                    on
                      ? "border-transparent bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                      : "border-black/25 dark:border-white/30"
                  }`}
                >
                  {on ? "✓" : ""}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[15px]">
                      {expense.description}
                    </span>
                    <span className="shrink-0 text-sm tabular-nums opacity-70">
                      {formatMoney(expense.amount_minor_units, currency)}
                    </span>
                  </span>
                  <span className="block truncate text-xs opacity-55">
                    {formatDate(expense.expense_date)} · entre{" "}
                    {current_participant_names.join(", ")}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex gap-2">
        <Button
          full
          disabled={busy || checkedIds.length === 0}
          onClick={confirm}
        >
          {busy
            ? "Aplicando…"
            : checkedIds.length === 0
              ? "Elegí al menos uno"
              : `Sumar a ${checkedIds.length} gasto${checkedIds.length === 1 ? "" : "s"}`}
        </Button>
        <Button variant="ghost" full disabled={busy} onClick={onDone}>
          Ahora no
        </Button>
      </div>
    </div>
  );
}
