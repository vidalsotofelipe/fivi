"use client";

/**
 * Primitivos de UI chicos y sin estado del rediseño mobile-first.
 * Colores por tokens (`bg`, `surface`, `border`, `accent`, …).
 */
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Spinner accesible (marca `role="status"` sólo si `label`). */
export function Spinner({
  className,
  label,
}: {
  className?: string;
  label?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      )}
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}

/** Bloque de carga (skeleton). Decorativo. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "block animate-pulse rounded-md bg-text/10",
        className,
      )}
    />
  );
}

/** Tarjeta de superficie. */
export function Card({
  raised,
  className,
  ...props
}: ComponentProps<"div"> & { raised?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-md border border-border p-4",
        raised ? "bg-surface-raised" : "bg-surface",
        className,
      )}
      {...props}
    />
  );
}

/** Chip / píldora seleccionable (filtros). */
export function Chip({
  selected,
  className,
  ...props
}: ComponentProps<"button"> & { selected?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "inline-flex min-h-touch items-center gap-1 whitespace-nowrap rounded-full border px-3.5 text-sm transition-colors",
        selected
          ? "border-accent bg-accent-weak font-medium text-accent"
          : "border-border bg-surface text-muted hover:text-text",
        className,
      )}
      {...props}
    />
  );
}

/** Barra de acciones fija abajo, respeta el safe-area. */
export function StickyActionBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-20 -mx-4 mt-4 border-t border-border bg-bg/95 px-4 pt-3 backdrop-blur",
        "pb-[calc(12px+env(safe-area-inset-bottom))]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Indicador de pasos "1 Detalle · 2 División · 3 Confirmar". */
export function StepIndicator({
  steps,
  current,
  className,
}: {
  steps: string[];
  /** índice 0-based del paso activo */
  current: number;
  className?: string;
}) {
  return (
    <ol
      className={cn("flex items-center gap-2 text-xs", className)}
      aria-label={`${current + 1}/${steps.length}`}
    >
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li
            key={label}
            className="flex min-w-0 items-center gap-1.5"
            aria-current={active ? "step" : undefined}
          >
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                done && "bg-accent text-accent-fg",
                active && "border-2 border-accent text-accent",
                !done && !active && "border border-border text-muted",
              )}
            >
              {done ? "✓" : i + 1}
            </span>
            <span
              className={cn(
                "truncate",
                active ? "font-medium text-text" : "text-muted",
              )}
            >
              {label}
            </span>
            {i < steps.length - 1 ? (
              <span aria-hidden="true" className="mx-1 text-muted">
                ·
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/** Control segmentado de 2+ opciones (Partes iguales / A medida). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        "flex rounded-md border border-border bg-surface p-1",
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "min-h-touch flex-1 rounded-sm px-3 text-sm font-medium transition-colors",
              active
                ? "bg-accent text-accent-fg"
                : "text-muted hover:text-text",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
