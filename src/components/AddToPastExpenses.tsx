"use client";

import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { db } from "@/data/db";
import { listPastEqualExpensesFor } from "@/data/queries";
import { addParticipantToExpenses } from "@/data/repositories/expenseRepo";
import type { CurrencyCode, Participant } from "@/domain/types";
import { formatDate, formatMoney } from "@/lib/format";
import { useLocale } from "./LocaleProvider";
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
  const { t } = useTranslation(["people", "common"]);
  const { lang } = useLocale();
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
    <div className="flex flex-col gap-3 rounded-md border border-border bg-surface p-3">
      <p className="text-sm font-medium text-text">
        {t("people:pastTitle", { name: participant.name })}
      </p>
      <p className="text-xs text-muted">{t("people:pastHint")}</p>

      <ul className="flex flex-col divide-y divide-border">
        {picks.map(({ expense, current_participant_names }) => {
          const on = selected.has(expense.id);
          return (
            <li key={expense.id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => toggle(expense.id)}
                className="flex w-full items-start gap-3 py-2.5 text-left"
              >
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${
                    on
                      ? "border-transparent bg-accent text-accent-fg"
                      : "border-border"
                  }`}
                >
                  {on ? "✓" : ""}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[15px] text-text">
                      {expense.description}
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-muted">
                      {formatMoney(expense.amount_minor_units, currency, lang)}
                    </span>
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {formatDate(expense.expense_date, lang)} ·{" "}
                    {t("people:pastBetween", {
                      names: current_participant_names.join(", "),
                    })}
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
          loading={busy}
          disabled={busy || checkedIds.length === 0}
          onClick={confirm}
        >
          {checkedIds.length === 0
            ? t("people:pastPickOne")
            : t("people:pastApply", { count: checkedIds.length })}
        </Button>
        <Button variant="ghost" full disabled={busy} onClick={onDone}>
          {t("people:pastNotNow")}
        </Button>
      </div>
    </div>
  );
}
