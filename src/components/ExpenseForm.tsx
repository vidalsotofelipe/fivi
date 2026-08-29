"use client";

import { useMemo, useState } from "react";
import { splitEqually } from "@/domain/split";
import { formatMoney, minorToRawInput } from "@/domain/money";
import type { CurrencyCode, Participant } from "@/domain/types";
import { todayIso } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Button } from "./Button";
import { Field, Select, TextInput } from "./fields";
import { MoneyInput, parseAmount } from "./MoneyInput";

export interface ExpenseFormValues {
  description: string;
  amount_minor_units: number;
  paid_by: string;
  participant_ids: string[];
  expense_date: string;
}

export function ExpenseForm({
  currency,
  participants,
  initial,
  submitLabel,
  onSubmit,
}: {
  currency: CurrencyCode;
  participants: Participant[];
  initial?: Partial<ExpenseFormValues> & { amountRaw?: string };
  submitLabel: string;
  onSubmit: (values: ExpenseFormValues) => Promise<void>;
}) {
  const [description, setDescription] = useState(initial?.description ?? "");
  const [amountRaw, setAmountRaw] = useState(
    initial?.amountRaw ??
      (initial?.amount_minor_units
        ? minorToRawInput(initial.amount_minor_units, currency)
        : ""),
  );
  const [paidBy, setPaidBy] = useState(
    initial?.paid_by ?? participants[0]?.id ?? "",
  );
  const [date, setDate] = useState(initial?.expense_date ?? todayIso());
  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(initial?.participant_ids ?? participants.map((p) => p.id)),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountMinor = parseAmount(amountRaw, currency);
  const selectedIds = participants
    .map((p) => p.id)
    .filter((id) => selected.has(id));

  const perPersonPreview = useMemo(() => {
    if (!amountMinor || selectedIds.length === 0) return null;
    const shares = splitEqually(amountMinor, selectedIds);
    const min = Math.min(...shares.map((s) => s.share_minor_units));
    const max = Math.max(...shares.map((s) => s.share_minor_units));
    return min === max
      ? `${formatMoney(min, currency)} cada una`
      : `entre ${formatMoney(min, currency)} y ${formatMoney(max, currency)} cada una`;
  }, [amountMinor, selectedIds, currency]);

  const canSubmit =
    description.trim() !== "" &&
    amountMinor !== null &&
    paidBy !== "" &&
    selectedIds.length > 0 &&
    !busy;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || amountMinor === null) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        description: description.trim(),
        amount_minor_units: amountMinor,
        paid_by: paidBy,
        participant_ids: selectedIds,
        expense_date: date,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field label="Descripción">
        <TextInput
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Cena, supermercado, Uber…"
          autoFocus
        />
      </Field>

      <Field label="Monto">
        <MoneyInput
          currency={currency}
          value={amountRaw}
          onChange={setAmountRaw}
        />
      </Field>

      <Field label="Pagó">
        <Select value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
          {participants.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Fecha">
        <TextInput
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </Field>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium">Se divide entre</span>
          <span className="text-xs opacity-60">
            {perPersonPreview ?? "partes iguales"}
          </span>
        </div>
        <ul className="grid grid-cols-2 gap-2">
          {participants.map((p) => {
            const on = selected.has(p.id);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => toggle(p.id)}
                  className={cn(
                    "w-full truncate rounded-xl border px-3 py-2.5 text-left text-[15px]",
                    on
                      ? "border-transparent bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                      : "border-black/10 dark:border-white/15",
                  )}
                >
                  {on ? "✓ " : ""}
                  {p.name}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <Button type="submit" full disabled={!canSubmit}>
        {busy ? "Guardando…" : submitLabel}
      </Button>
    </form>
  );
}
