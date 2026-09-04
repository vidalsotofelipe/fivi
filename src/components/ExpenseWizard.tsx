"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { computeShares, splitEqually, type Share } from "@/domain/split";
import { PERCENT_TOLERANCE } from "@/domain/splitErrors";
import { EXPENSE_DESCRIPTION_MAX } from "@/domain/limits";
import { minorToRawInput } from "@/domain/money";
import type {
  CurrencyCode,
  Participant,
  SplitStrategy,
} from "@/domain/types";
import { cn } from "@/lib/cn";
import { formatDate, localeFor, todayIso } from "@/lib/format";
import { formatPercent, splitErrorText } from "@/lib/splitErrorText";
import { Button } from "@/components/Button";
import { Money } from "@/components/Money";
import { QuickExpensePicker } from "@/components/QuickExpensePicker";
import { useLocale } from "@/components/LocaleProvider";
import {
  StepIndicator,
  StickyActionBar,
  SegmentedControl,
} from "@/components/ui/primitives";
import { FormError } from "@/components/fields";
import { TextField } from "@/components/ui/TextField";
import { DateField, MoneyField, SelectField } from "@/components/ui/formfields";
import { parseAmount } from "@/lib/amount";

export interface ExpenseDraft {
  description: string;
  amount_minor_units: number;
  paid_by: string;
  participant_ids: string[];
  expense_date: string;
  split_strategy: SplitStrategy;
}

type CustomKind = "amount" | "percent" | "shares";

function num(raw: string | undefined): number {
  const n = Number((raw ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function seedRows(
  kind: CustomKind,
  ids: string[],
  amountMinor: number | null,
  currency: CurrencyCode,
  locale: string,
): Record<string, string> {
  if (kind === "shares")
    return Object.fromEntries(ids.map((id) => [id, "1"]));
  if (kind === "percent") {
    // Reparte 100 % en centésimas para que la semilla sume exactamente 100.
    const parts = splitEqually(10000, ids);
    return Object.fromEntries(
      parts.map((p) => [p.participant_id, (p.share_minor_units / 100).toString()]),
    );
  }
  if (amountMinor == null)
    return Object.fromEntries(ids.map((id) => [id, ""]));
  const parts = splitEqually(amountMinor, ids);
  return Object.fromEntries(
    parts.map((p) => [
      p.participant_id,
      minorToRawInput(p.share_minor_units, currency, locale),
    ]),
  );
}

function seedFromStrategy(
  s: SplitStrategy | undefined,
  currency: CurrencyCode,
  locale: string,
): { mode: "equal" | "custom"; kind: CustomKind; rows: Record<string, string> } {
  if (!s || s.kind === "equal")
    return { mode: "equal", kind: "amount", rows: {} };
  if (s.kind === "amount") {
    return {
      mode: "custom",
      kind: "amount",
      rows: Object.fromEntries(
        Object.entries(s.amounts).map(([id, v]) => [
          id,
          minorToRawInput(v, currency, locale),
        ]),
      ),
    };
  }
  const map = s.kind === "percent" ? s.percents : s.shares;
  return {
    mode: "custom",
    kind: s.kind,
    rows: Object.fromEntries(Object.entries(map).map(([id, v]) => [id, String(v)])),
  };
}

/**
 * Alta / edición de un gasto en 2 pasos: **Detalle → División**.
 *
 * El segundo paso ES la confirmación: muestra la división y **cuánto le
 * corresponde a cada persona**, y desde ahí se guarda directamente (sin una
 * tercera pantalla de "revisar"). Reusa el motor de dominio (`computeShares`);
 * no cambia reglas de negocio.
 */
export function ExpenseWizard({
  groupId,
  participants,
  currency,
  initial,
  defaultPayer,
  submitLabel,
  onSubmit,
}: {
  groupId: string;
  participants: Participant[];
  currency: CurrencyCode;
  initial?: Partial<ExpenseDraft>;
  defaultPayer?: string;
  submitLabel: string;
  onSubmit: (draft: ExpenseDraft) => Promise<void>;
}) {
  const { t } = useTranslation(["expense", "common", "errors", "group"]);
  const { lang } = useLocale();
  // Locale de la interfaz: manda al leer y escribir montos (ver `toMinorUnits`).
  const locale = localeFor(lang);

  const seed = seedFromStrategy(initial?.split_strategy, currency, locale);

  const [step, setStep] = useState(0);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [amountRaw, setAmountRaw] = useState(
    initial?.amount_minor_units
      ? minorToRawInput(initial.amount_minor_units, currency, locale)
      : "",
  );
  const [date, setDate] = useState(initial?.expense_date ?? todayIso());
  const [paidBy, setPaidBy] = useState(
    initial?.paid_by ?? defaultPayer ?? participants[0]?.id ?? "",
  );
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initial?.participant_ids ?? participants.map((p) => p.id)),
  );
  const [mode, setMode] = useState<"equal" | "custom">(seed.mode);
  const [customKind, setCustomKind] = useState<CustomKind>(seed.kind);
  const [rows, setRows] = useState<Record<string, string>>(seed.rows);
  const [busy, setBusy] = useState(false);
  const [stepErrors, setStepErrors] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);

  const amountMinor = parseAmount(amountRaw, currency, locale);
  const selectedIds = participants
    .map((p) => p.id)
    .filter((id) => selected.has(id));

  const strategy = useMemo<SplitStrategy>(() => {
    if (mode === "equal") return { kind: "equal" };
    if (customKind === "amount") {
      return {
        kind: "amount",
        amounts: Object.fromEntries(
          selectedIds.map((id) => [
            id,
            parseAmount(rows[id] ?? "", currency, locale) ?? 0,
          ]),
        ),
      };
    }
    const weights = Object.fromEntries(
      selectedIds.map((id) => [id, num(rows[id])]),
    );
    return customKind === "percent"
      ? { kind: "percent", percents: weights }
      : { kind: "shares", shares: weights };
  }, [mode, customKind, rows, selectedIds, currency, locale]);

  /**
   * Reparto en vivo. El error se guarda **sin traducir** (`SplitError` del
   * dominio) y se convierte a texto al pintar, con la moneda del grupo y el
   * idioma de la interfaz.
   */
  const preview = useMemo<
    { ok: true; shares: Share[] } | { ok: false; error: unknown }
  >(() => {
    if (amountMinor == null || selectedIds.length === 0)
      return { ok: false, error: null };
    try {
      return {
        ok: true,
        shares: computeShares(amountMinor, selectedIds, strategy),
      };
    } catch (err) {
      return { ok: false, error: err };
    }
  }, [amountMinor, selectedIds, strategy]);

  const previewError =
    !preview.ok && preview.error != null
      ? splitErrorText(preview.error, t, { currency, lang })
      : null;

  /** Sólo se puede guardar con un reparto válido. */
  const canSave =
    amountMinor != null && selectedIds.length > 0 && preview.ok;

  /** Cambiar de modo/estrategia/participantes invalida el error anterior. */
  function clearStepErrors() {
    setStepErrors((prev) => (prev.length > 0 ? [] : prev));
  }

  function toggle(id: string) {
    clearStepErrors();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        next.add(id);
        if (mode === "custom" && rows[id] === undefined) {
          setRows((r) => ({ ...r, [id]: customKind === "shares" ? "1" : "0" }));
        }
      }
      return next;
    });
  }

  function goNext() {
    // Paso 0 → 1: valida el detalle.
    const errs: string[] = [];
    if (description.trim() === "") errs.push(t("errors:descriptionRequired"));
    if (amountMinor == null) errs.push(t("errors:amountPositive"));
    if (paidBy === "") errs.push(t("expense:payerLabel"));
    setStepErrors(errs);
    if (errs.length === 0) setStep(1);
  }

  async function save() {
    // El botón ya está deshabilitado si el reparto no cierra; esto es la red de
    // seguridad. El detalle del problema se muestra junto al reparto, no acá
    // arriba, para no repetir el mismo error dos veces en pantalla.
    if (!canSave || amountMinor == null || !preview.ok) return;
    setStepErrors([]);
    setBusy(true);
    setSaveError(null);
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
      setSaveError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  const assignedMinor =
    customKind === "amount"
      ? selectedIds.reduce(
          (a, id) => a + (parseAmount(rows[id] ?? "", currency, locale) ?? 0),
          0,
        )
      : 0;
  const remainingMinor = (amountMinor ?? 0) - assignedMinor;
  const weightSum = selectedIds.reduce((a, id) => a + num(rows[id]), 0);

  const stepLabels = [t("expense:stepDetail"), t("expense:stepSplit")];
  const payerName = participants.find((p) => p.id === paidBy)?.name ?? "—";

  return (
    <div className="flex flex-1 flex-col gap-4">
      <StepIndicator steps={stepLabels} current={step} />
      {stepErrors.length > 0 ? <FormError messages={stepErrors} /> : null}

      {step === 0 ? (
        <div className="flex flex-col gap-4">
          {/* Descripción primero; los atajos van debajo, como sugerencias para
              completarla (no como un paso previo). */}
          <div className="flex flex-col gap-2">
            <TextField
              label={t("expense:descriptionLabel")}
              placeholder={t("expense:descriptionPlaceholder")}
              value={description}
              maxLength={EXPENSE_DESCRIPTION_MAX}
              onChange={(e) => setDescription(e.target.value)}
              hint={t("group:nameCount", {
                count: description.length,
                max: EXPENSE_DESCRIPTION_MAX,
              })}
            />
            <QuickExpensePicker
              groupId={groupId}
              value={description}
              onPick={(label) => {
                setDescription(label);
                if (stepErrors.length > 0) setStepErrors([]);
                if (label) {
                  requestAnimationFrame(() =>
                    document.getElementById("expense-amount")?.focus(),
                  );
                }
              }}
            />
          </div>
          <MoneyField
            id="expense-amount"
            label={t("expense:amountLabel")}
            currency={currency}
            value={amountRaw}
            onChange={setAmountRaw}
          />
          <DateField
            label={t("expense:dateLabel")}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <SelectField
            label={t("expense:payerLabel")}
            value={paidBy}
            onChange={(e) => setPaidBy(e.target.value)}
          >
            {participants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </SelectField>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="flex flex-col gap-4">
          {/* Resumen del detalle (a un "Volver" de editarlo). */}
          <div className="border-2 border-border bg-surface-raised px-4 py-3">
            <p className="font-semibold text-text">
              {description || "—"}{" "}
              <span className="font-normal text-muted">
                · <Money minor={amountMinor ?? 0} currency={currency} />
              </span>
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {formatDate(date, lang)} ·{" "}
              {t("expense:paidBy", { name: payerName })}
            </p>
          </div>

          <SegmentedControl
            label={t("expense:splitLabel")}
            value={mode}
            onChange={(m) => {
              clearStepErrors();
              setMode(m);
              if (m === "custom")
                setRows(
                  seedRows(customKind, selectedIds, amountMinor, currency, locale),
                );
            }}
            options={[
              { value: "equal", label: t("expense:splitEqual") },
              { value: "custom", label: t("expense:splitCustom") },
            ]}
          />

          {mode === "custom" ? (
            <SegmentedControl
              label={t("expense:splitLabel")}
              value={customKind}
              onChange={(k) => {
                clearStepErrors();
                setCustomKind(k);
                setRows(seedRows(k, selectedIds, amountMinor, currency, locale));
              }}
              options={[
                { value: "amount", label: t("expense:splitByAmount") },
                { value: "percent", label: t("expense:splitByPercent") },
                { value: "shares", label: t("expense:splitByShares") },
              ]}
            />
          ) : null}

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-text">
              {t("expense:selectParticipants")}
            </span>
            <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
              {participants.map((p) => {
                const on = selected.has(p.id);
                return (
                  <li key={p.id}>
                    <div className="flex items-center gap-3 px-3.5 py-2.5">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        aria-label={t("expense:includePerson", { name: p.name })}
                        onClick={() => toggle(p.id)}
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded border text-xs",
                          on
                            ? "border-accent bg-accent text-accent-fg"
                            : "border-border",
                        )}
                      >
                        <span aria-hidden="true">{on ? "✓" : ""}</span>
                      </button>
                      <span className="min-w-0 flex-1 truncate text-[15px] text-text">
                        {p.name}
                      </span>
                      {on && mode === "custom" ? (
                        <span className="flex items-center gap-1">
                          <input
                            inputMode="decimal"
                            aria-label={t(
                              customKind === "percent"
                                ? "expense:percentForPerson"
                                : customKind === "shares"
                                  ? "expense:sharesForPerson"
                                  : "expense:amountForPerson",
                              { name: p.name },
                            )}
                            value={rows[p.id] ?? ""}
                            onChange={(e) =>
                              setRows((r) => ({ ...r, [p.id]: e.target.value }))
                            }
                            className="w-24 border border-border bg-surface px-2 py-1.5 text-right text-base outline-none focus:border-accent"
                          />
                          <span className="w-3 text-xs text-muted">
                            {customKind === "percent"
                              ? "%"
                              : customKind === "shares"
                                ? "×"
                                : ""}
                          </span>
                        </span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {mode === "custom" && customKind === "amount" ? (
            <div className="flex justify-between rounded-md bg-text/[0.04] px-4 py-2 text-sm">
              <span className="text-muted">
                {t("expense:assigned")}:{" "}
                <Money minor={assignedMinor} currency={currency} />
              </span>
              <span
                className={cn(
                  remainingMinor === 0 ? "text-accent" : "text-warm-strong",
                )}
              >
                {t("expense:remaining")}:{" "}
                <Money minor={remainingMinor} currency={currency} />
              </span>
            </div>
          ) : null}

          {mode === "custom" && customKind !== "amount" ? (
            <p
              className={cn(
                "text-sm",
                customKind === "percent" &&
                  Math.abs(weightSum - 100) > PERCENT_TOLERANCE
                  ? "text-warm-strong"
                  : "text-muted",
              )}
            >
              {customKind === "percent"
                ? t("expense:percentTotal", {
                    sum: formatPercent(weightSum, lang),
                  })
                : t("expense:sharesTotal", {
                    sum: formatPercent(weightSum, lang),
                  })}
            </p>
          ) : null}

          {/* Cuánto le corresponde a cada persona. */}
          {preview.ok && preview.shares.length > 0 ? (
            <div className="flex flex-col gap-1">
              <span className="label-caps">{t("expense:eachOwes")}</span>
              <ul className="divide-y divide-border rounded-md border border-border">
                {preview.shares.map((s) => (
                  <li
                    key={s.participant_id}
                    className="flex items-center justify-between px-4 py-2.5 text-[15px]"
                  >
                    <span className="min-w-0 truncate text-text">
                      {participants.find((p) => p.id === s.participant_id)
                        ?.name ?? "—"}
                    </span>
                    <Money minor={s.share_minor_units} currency={currency} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {previewError ? (
            <p role="alert" className="text-sm text-danger">
              {previewError}
            </p>
          ) : null}

          <p className="text-xs text-muted">{t("expense:willUpdateBalances")}</p>
          {saveError ? <FormError messages={[saveError]} /> : null}
        </div>
      ) : null}

      <StickyActionBar>
        <div className="flex gap-2">
          {step > 0 ? (
            <Button
              variant="ghost"
              onClick={() => {
                setStepErrors([]);
                setStep((s) => s - 1);
              }}
              disabled={busy}
            >
              {t("common:back")}
            </Button>
          ) : null}
          {step === 0 ? (
            <Button full onClick={goNext}>
              {t("common:continue")}
            </Button>
          ) : (
            <Button full loading={busy} disabled={!canSave} onClick={save}>
              {busy ? t("expense:saving") : submitLabel}
            </Button>
          )}
        </div>
      </StickyActionBar>
    </div>
  );
}
