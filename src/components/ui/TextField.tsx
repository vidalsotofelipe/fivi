"use client";

import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { controlClass } from "@/components/fields";

type Base = {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  /** Adorno a la izquierda dentro del control (p. ej. el código de moneda). */
  prefix?: ReactNode;
};

/**
 * Campo de texto con label, ayuda y error cableados por `aria-describedby` /
 * `aria-invalid`. Para los flujos rediseñados.
 */
export function TextField({
  label,
  hint,
  error,
  prefix,
  className,
  id,
  ...props
}: Base & ComponentProps<"input">) {
  const auto = useId();
  const fieldId = id ?? auto;
  const hintId = `${fieldId}-hint`;
  const errId = `${fieldId}-err`;
  const describedBy =
    [error ? errId : null, hint ? hintId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-medium text-text">
        {label}
      </label>
      <div
        className={cn(
          "flex items-center rounded-md border bg-surface",
          error ? "border-danger" : "border-border focus-within:border-accent",
        )}
      >
        {prefix ? (
          <span className="pl-3.5 text-sm text-muted" aria-hidden="true">
            {prefix}
          </span>
        ) : null}
        <input
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            controlClass,
            "border-0 bg-transparent focus:border-0",
            prefix && "pl-2",
            className,
          )}
          {...props}
        />
      </div>
      {error ? (
        <span id={errId} role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : hint ? (
        <span id={hintId} className="text-xs text-muted">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/** Igual que TextField pero multilínea (para descripciones). */
export function TextAreaField({
  label,
  hint,
  error,
  className,
  id,
  ...props
}: Base & ComponentProps<"textarea">) {
  const auto = useId();
  const fieldId = id ?? auto;
  const hintId = `${fieldId}-hint`;
  const errId = `${fieldId}-err`;
  const describedBy =
    [error ? errId : null, hint ? hintId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-medium text-text">
        {label}
      </label>
      <textarea
        id={fieldId}
        rows={3}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          controlClass,
          error && "border-danger",
          className,
        )}
        {...props}
      />
      {error ? (
        <span id={errId} role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : hint ? (
        <span id={hintId} className="text-xs text-muted">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
