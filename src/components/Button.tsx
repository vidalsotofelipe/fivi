"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "@/components/ui/primitives";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const base =
  "inline-flex min-h-touch items-center justify-center gap-2 border-2 px-4 text-[15px] font-bold " +
  "transition-colors select-none disabled:opacity-40 disabled:pointer-events-none active:translate-y-px";

const variants: Record<Variant, string> = {
  primary:
    "border-accent bg-accent text-accent-fg hover:border-accent-strong hover:bg-accent-strong",
  secondary:
    "border-border-strong bg-transparent text-text hover:bg-accent-weak",
  ghost: "border-transparent text-text hover:bg-accent-weak",
  danger: "border-danger bg-danger text-danger-fg hover:opacity-90",
};

type ButtonProps = ComponentProps<"button"> & {
  variant?: Variant;
  full?: boolean;
  loading?: boolean;
};

export function Button({
  variant = "primary",
  full,
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(base, variants[variant], full && "w-full", className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

export function LinkButton({
  variant = "primary",
  full,
  className,
  children,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; full?: boolean }) {
  return (
    <Link
      className={cn(base, variants[variant], full && "w-full", className)}
      {...props}
    >
      {children as ReactNode}
    </Link>
  );
}

/** Botón sólo-icono. `label` es obligatorio (nombre accesible). */
export function IconButton({
  label,
  className,
  children,
  ...props
}: ComponentProps<"button"> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "inline-flex h-11 w-11 shrink-0 items-center justify-center border-2 border-transparent text-text transition-colors hover:bg-accent-weak",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
