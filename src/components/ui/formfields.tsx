"use client";

import { useId, type ComponentProps, type ReactNode } from "react";
import { formatMoney as domainFormatMoney, toMinorUnits } from "@/domain/money";
import type { CurrencyCode } from "@/domain/types";
import { cn } from "@/lib/cn";
import { controlClass } from "@/components/fields";

function labelledIds(id: string | undefined, auto: string, error?: string | null, hint?: ReactNode) {
  const fieldId = id ?? auto;
  const errId = `${fieldId}-err`;
  const hintId = `${fieldId}-hint`;
  const describedBy =
    [error ? errId : null, hint ? hintId : null].filter(Boolean).join(" ") ||
    undefined;
  return { fieldId, errId, hintId, describedBy };
}

function Feedback({
  error,
  hint,
  errId,
  hintId,
}: {
  error?: string | null;
  hint?: ReactNode;
  errId: string;
  hintId: string;
}) {
  if (error)
    return (
      <span id={errId} role="alert" className="text-xs text-danger">
        {error}
      </span>
    );
  if (hint)
    return (
      <span id={hintId} className="text-xs text-muted">
        {hint}
      </span>
    );
  return null;
}

/** Campo de monto: prefijo de moneda + teclado decimal + previsualización. */
export function MoneyField({
  label,
  currency,
  value,
  onChange,
  error,
  hint,
  id,
}: {
  label: string;
  currency: CurrencyCode;
  value: string;
  onChange: (raw: string) => void;
  error?: string | null;
  hint?: ReactNode;
  id?: string;
}) {
  const auto = useId();
  const { fieldId, errId, hintId, describedBy } = labelledIds(id, auto, error, hint);

  let preview: string | null = null;
  if (value.trim()) {
    try {
      preview = domainFormatMoney(toMinorUnits(value, currency), currency);
    } catch {
      preview = null;
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-semibold text-text">
        {label}
      </label>
      <div
        className={cn(
          "flex items-stretch rounded-md border bg-surface",
          error ? "border-danger" : "border-border focus-within:border-accent",
        )}
      >
        <span
          aria-hidden="true"
          className="flex items-center bg-surface-raised px-3 text-sm font-bold text-muted"
        >
          {currency}
        </span>
        <input
          id={fieldId}
          inputMode="decimal"
          placeholder="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(controlClass, "border-0 bg-transparent")}
        />
      </div>
      <span className="min-h-4 text-xs text-muted">
        {preview ? `= ${preview}` : null}
      </span>
      <Feedback error={error} hint={hint} errId={errId} hintId={hintId} />
    </div>
  );
}

/** Campo de fecha nativo con estilo de token. */
export function DateField({
  label,
  error,
  hint,
  id,
  className,
  ...props
}: {
  label: string;
  error?: string | null;
  hint?: ReactNode;
} & ComponentProps<"input">) {
  const auto = useId();
  const { fieldId, errId, hintId, describedBy } = labelledIds(id, auto, error, hint);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-semibold text-text">
        {label}
      </label>
      <input
        id={fieldId}
        type="date"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(controlClass, error && "border-danger", className)}
        {...props}
      />
      <Feedback error={error} hint={hint} errId={errId} hintId={hintId} />
    </div>
  );
}

/** Select nativo con estilo de token. */
export function SelectField({
  label,
  error,
  hint,
  id,
  className,
  children,
  ...props
}: {
  label: string;
  error?: string | null;
  hint?: ReactNode;
} & ComponentProps<"select">) {
  const auto = useId();
  const { fieldId, errId, hintId, describedBy } = labelledIds(id, auto, error, hint);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-semibold text-text">
        {label}
      </label>
      <div className="relative">
        <select
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            controlClass,
            "appearance-none pr-10",
            error && "border-danger",
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted"
        >
          ▾
        </span>
      </div>
      <Feedback error={error} hint={hint} errId={errId} hintId={hintId} />
    </div>
  );
}
