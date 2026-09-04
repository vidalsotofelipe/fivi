"use client";

import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { db } from "@/data/db";
import { listPastExpensesFor } from "@/data/queries";
import { addParticipantToExpenses } from "@/data/repositories/expenseRepo";
import type { CurrencyCode, Participant } from "@/domain/types";
import { formatDate, formatMoney } from "@/lib/format";
import { useLocale } from "./LocaleProvider";
import { Button } from "./Button";

/**
 * Al sumar un participante nuevo, pregunta en qué gastos ya registrados
 * corresponde tenerlo en cuenta y rehace el reparto de los elegidos.
 *
 * Sólo se pueden rehacer automáticamente los de **división equitativa**: en uno
 * a medida habría que inventar cuánto le toca a la persona nueva. Antes esos
 * gastos se omitían por completo, así que "todos o algunos gastos anteriores"
 * era una promesa incompleta y silenciosa. Ahora se listan aparte, sin poder
 * tildarlos, explicando por qué y con acceso directo a editarlos.
 *
 * `explicit` distingue las dos formas de llegar acá:
 *  - `false` (default) — se abrió solo tras crear a la persona: si no hay nada
 *    que ofrecer, se cierra sin molestar.
 *  - `true` — la persona tocó "Gastos anteriores": si no hay nada, hay que
 *    decirlo. Antes no pasaba nada al tocar el botón.
 */
export function AddToPastExpenses({
  groupId,
  participant,
  currency,
  explicit = false,
  onDone,
}: {
  groupId: string;
  participant: Participant;
  currency: CurrencyCode;
  explicit?: boolean;
  onDone: () => void;
}) {
  const { t } = useTranslation(["people", "common"]);
  const { lang } = useLocale();
  const picks = useLiveQuery(
    () => listPastExpensesFor(groupId, participant.id, db),
    [groupId, participant.id],
  );

  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState(false);

  const equal = useMemo(() => picks?.equal ?? [], [picks]);
  const custom = useMemo(() => picks?.custom ?? [], [picks]);
  const nothing = picks != null && equal.length === 0 && custom.length === 0;

  // Pre-selecciona los gastos que hoy incluyen a todo el grupo.
  useEffect(() => {
    if (picks && selected === null) {
      setSelected(
        new Set(
          picks.equal
            .filter((p) => p.includes_all_others)
            .map((p) => p.expense.id),
        ),
      );
    }
  }, [picks, selected]);

  // Nada donde sumarlo y no lo pidió explícitamente: cerrar sin molestar.
  useEffect(() => {
    if (nothing && !explicit) onDone();
  }, [nothing, explicit, onDone]);

  const checkedIds = useMemo(
    () => (selected ? [...selected] : []),
    [selected],
  );

  if (!picks || selected === null) return null;

  if (nothing) {
    if (!explicit) return null;
    return (
      <div className="flex flex-col gap-3 rounded-md border border-border bg-surface p-3">
        <p className="text-sm font-medium text-text">
          {t("people:pastNoneTitle", { name: participant.name })}
        </p>
        <Button variant="ghost" full onClick={onDone}>
          {t("common:close")}
        </Button>
      </div>
    );
  }

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

      {equal.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border">
          {equal.map(({ expense, current_participant_names }) => {
            const on = selected!.has(expense.id);
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
      ) : null}

      {/* División a medida: no se puede rehacer sola, pero se ve y se puede
          editar a mano. */}
      {custom.length > 0 ? (
        <div className="flex flex-col gap-1 border-t border-border pt-3">
          <p className="text-sm font-medium text-text">
            {t("people:pastCustomTitle")}
          </p>
          <p className="text-xs text-muted">
            {t("people:pastCustomHint", { name: participant.name })}
          </p>
          <ul className="flex flex-col divide-y divide-border">
            {custom.map(({ expense }) => (
              <li
                key={expense.id}
                className="flex items-center justify-between gap-2 py-2.5"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[15px] text-muted">
                      {expense.description}
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-muted">
                      {formatMoney(expense.amount_minor_units, currency, lang)}
                    </span>
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {formatDate(expense.expense_date, lang)}
                  </span>
                </span>
                <Link
                  href={`/g/${groupId}/gastos/${expense.id}/editar`}
                  className="flex min-h-touch shrink-0 items-center px-2 text-xs font-medium text-accent"
                >
                  {t("people:pastCustomOpen")}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex gap-2">
        {equal.length > 0 ? (
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
        ) : null}
        <Button variant="ghost" full disabled={busy} onClick={onDone}>
          {equal.length > 0 ? t("people:pastNotNow") : t("common:close")}
        </Button>
      </div>
    </div>
  );
}
