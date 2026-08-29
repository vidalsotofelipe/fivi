"use client";

import { useMemo, useState } from "react";
import {
  computeShares,
  splitEqually,
  type Share,
} from "@/domain/split";
import { formatMoney, minorToRawInput } from "@/domain/money";
import type { CurrencyCode, Participant, SplitStrategy } from "@/domain/types";
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
  split_strategy: SplitStrategy;
}

type Kind = SplitStrategy["kind"];

const KINDS: { kind: Kind; label: string }[] = [
  { kind: "equal", label: "Igual" },
  { kind: "amount", label: "Montos" },
  { kind: "percent", label: "%" },
  { kind: "shares", label: "Partes" },
];

function numOf(raw: string | undefined): number {
  const n = Number((raw ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
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
    () => new Set(initial?.participant_ids ?? participants.map((p) => p.id)),
  );
  const [kind, setKind] = useState<Kind>(initial?.split_strategy?.kind ?? "equal");
  const [rows, setRows] = useState<Record<string, string>>(() =>
    seedFromStrategy(initial?.split_strategy, currency),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountMinor = parseAmount(amountRaw, currency);
  const selectedIds = participants
    .map((p) => p.id)
    .filter((id) => selected.has(id));

  const strategy = useMemo<SplitStrategy>(() => {
    if (kind === "equal") return { kind: "equal" };
    if (kind === "amount") {
      return {
        kind: "amount",
        amounts: Object.fromEntries(
          selectedIds.map((id) => [
            id,
            parseAmount(rows[id] ?? "", currency) ?? 0,
          ]),
        ),
      };
    }
    const weights = Object.fromEntries(
      selectedIds.map((id) => [id, numOf(rows[id])]),
    );
    return kind === "percent"
      ? { kind: "percent", percents: weights }
      : { kind: "shares", shares: weights };
  }, [kind, rows, selectedIds, currency]);

  const preview = useMemo<
    { ok: true; shares: Share[] } | { ok: false; error: string }
  >(() => {
    if (amountMinor === null || selectedIds.length === 0) {
      return { ok: false, error: "" };
    }
    try {
      return { ok: true, shares: computeShares(amountMinor, selectedIds, strategy) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }, [amountMinor, selectedIds, strategy]);

  const canSubmit =
    description.trim() !== "" &&
    amountMinor !== null &&
    paidBy !== "" &&
    selectedIds.length > 0 &&
    preview.ok &&
    !busy;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        next.add(id);
        if (kind !== "equal") {
          setRows((r) =>
            r[id] !== undefined ? r : { ...r, [id]: defaultRow(kind) },
          );
        }
      }
      return next;
    });
  }

  function changeKind(next: Kind) {
    setKind(next);
    if (next === "equal") return;
    setRows(() => seedRows(next, selectedIds, amountMinor, currency));
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
        split_strategy: strategy,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  const selectedParticipants = participants.filter((p) => selected.has(p.id));

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
        <MoneyInput currency={currency} value={amountRaw} onChange={setAmountRaw} />
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
        <span className="text-sm font-medium">Se divide entre</span>
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

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Cómo se divide</span>
        <div className="grid grid-cols-4 gap-1 rounded-xl bg-black/5 p-1 dark:bg-white/10">
          {KINDS.map((k) => (
            <button
              key={k.kind}
              type="button"
              onClick={() => changeKind(k.kind)}
              className={cn(
                "rounded-lg py-2 text-sm",
                kind === k.kind
                  ? "bg-white shadow-sm dark:bg-gray-900"
                  : "opacity-60",
              )}
            >
              {k.label}
            </button>
          ))}
        </div>

        {kind !== "equal" && selectedParticipants.length > 0 ? (
          <ul className="flex flex-col gap-2 rounded-xl border border-black/10 p-3 dark:border-white/15">
            {selectedParticipants.map((p) => (
              <li key={p.id} className="flex items-center gap-2">
                <span className="flex-1 truncate text-[15px]">{p.name}</span>
                {kind === "amount" ? (
                  <span className="text-xs opacity-60">{currency}</span>
                ) : null}
                <input
                  inputMode="decimal"
                  value={rows[p.id] ?? ""}
                  onChange={(e) =>
                    setRows((r) => ({ ...r, [p.id]: e.target.value }))
                  }
                  className="w-24 rounded-lg border border-black/10 bg-white px-2 py-1.5 text-right text-[15px] outline-none focus:border-black/30 dark:border-white/15 dark:bg-white/5"
                />
                {kind === "percent" ? (
                  <span className="text-xs opacity-60">%</span>
                ) : kind === "shares" ? (
                  <span className="text-xs opacity-60">×</span>
                ) : null}
              </li>
            ))}
            <li className="border-t border-black/5 pt-2 text-xs opacity-70 dark:border-white/10">
              {summaryLine(kind, rows, selectedIds, currency, amountMinor)}
            </li>
          </ul>
        ) : null}

        {kind === "equal" && preview.ok ? (
          <p className="text-xs opacity-60">
            {equalPreview(preview.shares, currency)}
          </p>
        ) : null}

        {!preview.ok && preview.error ? (
          <p className="text-xs text-red-600">{preview.error}</p>
        ) : null}

        {kind !== "equal" && preview.ok ? (
          <ul className="text-xs opacity-70">
            {preview.shares.map((s) => {
              const name =
                participants.find((p) => p.id === s.participant_id)?.name ?? "—";
              return (
                <li key={s.participant_id} className="flex justify-between">
                  <span>{name}</span>
                  <span>{formatMoney(s.share_minor_units, currency)}</span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <Button type="submit" full disabled={!canSubmit}>
        {busy ? "Guardando…" : submitLabel}
      </Button>
    </form>
  );
}

// --- helpers ---------------------------------------------------------------

function defaultRow(kind: Kind): string {
  if (kind === "shares") return "1";
  return "0";
}

function seedRows(
  kind: Kind,
  selectedIds: string[],
  amountMinor: number | null,
  currency: CurrencyCode,
): Record<string, string> {
  if (kind === "shares") {
    return Object.fromEntries(selectedIds.map((id) => [id, "1"]));
  }
  if (kind === "percent") {
    const parts = splitEqually(10000, selectedIds); // reparte 100% en centésimas
    return Object.fromEntries(
      parts.map((p) => [
        p.participant_id,
        (p.share_minor_units / 100).toString(),
      ]),
    );
  }
  // amount: repartir el total actual en partes iguales como punto de partida
  if (amountMinor === null) {
    return Object.fromEntries(selectedIds.map((id) => [id, ""]));
  }
  const parts = splitEqually(amountMinor, selectedIds);
  return Object.fromEntries(
    parts.map((p) => [
      p.participant_id,
      minorToRawInput(p.share_minor_units, currency),
    ]),
  );
}

function seedFromStrategy(
  strategy: SplitStrategy | undefined,
  currency: CurrencyCode,
): Record<string, string> {
  if (!strategy || strategy.kind === "equal") return {};
  if (strategy.kind === "amount") {
    return Object.fromEntries(
      Object.entries(strategy.amounts).map(([id, v]) => [
        id,
        minorToRawInput(v, currency),
      ]),
    );
  }
  const map = strategy.kind === "percent" ? strategy.percents : strategy.shares;
  return Object.fromEntries(
    Object.entries(map).map(([id, v]) => [id, String(v)]),
  );
}

function equalPreview(shares: Share[], currency: CurrencyCode): string {
  const values = shares.map((s) => s.share_minor_units);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max
    ? `${formatMoney(min, currency)} cada una`
    : `entre ${formatMoney(min, currency)} y ${formatMoney(max, currency)} cada una`;
}

function summaryLine(
  kind: Kind,
  rows: Record<string, string>,
  selectedIds: string[],
  currency: CurrencyCode,
  amountMinor: number | null,
): string {
  if (kind === "amount") {
    const assigned = selectedIds.reduce(
      (acc, id) => acc + (parseAmount(rows[id] ?? "", currency) ?? 0),
      0,
    );
    const total = amountMinor ?? 0;
    const diff = total - assigned;
    const base = `Asignado ${formatMoney(assigned, currency)} de ${formatMoney(total, currency)}`;
    if (diff === 0) return `${base} · ✓`;
    return diff > 0
      ? `${base} · faltan ${formatMoney(diff, currency)}`
      : `${base} · sobran ${formatMoney(-diff, currency)}`;
  }
  const sum = selectedIds.reduce((acc, id) => acc + numOf(rows[id]), 0);
  return kind === "percent"
    ? `Suma: ${Number(sum.toFixed(2))}%`
    : `Total de partes: ${Number(sum.toFixed(2))}`;
}
