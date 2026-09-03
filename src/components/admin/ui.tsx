"use client";

/**
 * Primitivas visuales del panel admin. Reusan los tokens de FIVI (bordes 2px,
 * esquinas rectas, `.label-caps`, paleta azul/naranja/verde) pero con una
 * estructura propia de back-office (más densa, tabular).
 */
import { cn } from "@/lib/cn";
import type { ReactNode } from "react";
import { dateRangeError } from "@/lib/adminDates";

export { dateRangeError };

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-border-strong pb-3">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tightest">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Card({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <section className={cn("border border-border bg-surface p-4", className)}>
      {title ? <p className="label-caps mb-2">{title}</p> : null}
      {children}
    </section>
  );
}

export function Kpi({
  label,
  value,
  hint,
  delta,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  delta?: number | null;
}) {
  return (
    <div className="border border-border bg-surface p-4">
      <p className="label-caps">{label}</p>
      <p className="font-display mt-1 text-2xl font-bold tracking-tightest">{value}</p>
      <div className="mt-1 flex items-center gap-2 text-xs text-muted">
        {hint ? <span>{hint}</span> : null}
        {typeof delta === "number" && Number.isFinite(delta) ? (
          <span
            className={cn(
              "font-semibold",
              delta > 0 && "text-positive",
              delta < 0 && "text-warm-strong",
            )}
          >
            {delta > 0 ? "▲" : delta < 0 ? "▼" : "="} {Math.abs(delta)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse border border-border bg-surface-raised", className)}
      style={{ animationDuration: "1.4s" }}
      aria-hidden
    />
  );
}

export function SkeletonRows({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div
      className="space-y-2"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Cargando datos…</span>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-2">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-9 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Skeleton del detalle (Grupo / Usuario): reproduce la estructura real —cabecera,
 * grilla de datos, dos tarjetas de conteo, una lista— en vez de dos bloques
 * vacíos, y anuncia la carga a lectores de pantalla.
 */
export function DetailSkeleton({ label = "Cargando…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-6">
      <span className="sr-only">{label}</span>
      <div className="border border-border bg-surface p-4">
        <Skeleton className="h-6 w-48" />
        <div className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i}>
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-1 h-4 w-40" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <div className="border border-border bg-surface p-4">
        <Skeleton className="h-3 w-28" />
        <div className="mt-3 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="border border-dashed border-border bg-surface p-8 text-center">
      <p className="font-display text-lg font-bold">{title}</p>
      {description ? <p className="mx-auto mt-1 max-w-md text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="border border-danger bg-surface p-6 text-center" role="alert">
      <p className="font-display font-bold text-danger">No se pudo cargar</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 min-h-touch border border-border-strong px-4 text-sm font-semibold hover:bg-surface-raised"
        >
          Reintentar
        </button>
      ) : null}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "warm" | "positive" | "danger";
}) {
  const tones: Record<string, string> = {
    neutral: "border-border text-muted",
    accent: "border-accent text-accent-strong",
    warm: "border-warm text-warm-strong",
    positive: "border-positive text-positive",
    danger: "border-danger text-danger",
  };
  return (
    <span className={cn("inline-block border px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-caps", tones[tone])}>
      {children}
    </span>
  );
}

export function Button({
  children,
  onClick,
  type = "button",
  variant = "primary",
  disabled,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "ghost" | "danger";
  disabled?: boolean;
  className?: string;
}) {
  const variants: Record<string, string> = {
    primary: "border-accent bg-accent text-accent-fg hover:bg-accent-strong",
    ghost: "border-border-strong bg-transparent hover:bg-surface-raised",
    danger: "border-danger bg-danger text-danger-fg hover:opacity-90",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "min-h-touch border px-4 text-sm font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none",
        variants[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Tabla con scroll horizontal contenido (nunca desborda el body). */
export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto border border-border">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({
  children,
  className,
  scope = "col",
}: {
  children: ReactNode;
  className?: string;
  /** `col` para encabezados de columna (default), `row` para celdas-encabezado de fila. */
  scope?: "col" | "row";
}) {
  return (
    <th
      scope={scope}
      className={cn(
        "whitespace-nowrap border-b-2 border-border-strong bg-surface-raised px-3 py-2 text-left align-bottom label-caps",
        scope === "row" && "border-b border-border bg-transparent align-top font-normal normal-case tracking-normal",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn("border-b border-border px-3 py-2 align-top", className)}>{children}</td>;
}

/**
 * Rango de fechas para las tablas del panel. La página usa `dateRangeError`
 * (de `@/lib/adminDates`) para NO ejecutar la consulta hasta corregir el rango.
 */
export function DateRangeFields({
  from,
  to,
  onFrom,
  onTo,
}: {
  from: string | null | undefined;
  to: string | null | undefined;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
}) {
  const invalid = dateRangeError(from, to) != null;
  const field =
    "mt-1 block border border-border-strong bg-bg px-2 py-2 text-sm aria-[invalid=true]:border-danger";
  return (
    <>
      <label className="block">
        <span className="label-caps">Desde</span>
        <input
          type="date"
          lang="es-AR"
          value={from ?? ""}
          max={to || undefined}
          aria-invalid={invalid || undefined}
          onChange={(e) => onFrom(e.target.value)}
          className={field}
        />
      </label>
      <label className="block">
        <span className="label-caps">Hasta</span>
        <input
          type="date"
          lang="es-AR"
          value={to ?? ""}
          min={from || undefined}
          aria-invalid={invalid || undefined}
          onChange={(e) => onTo(e.target.value)}
          className={field}
        />
      </label>
    </>
  );
}

export function Pagination({
  total,
  limit,
  offset,
  onPage,
}: {
  total: number;
  limit: number;
  offset: number;
  onPage: (nextOffset: number) => void;
}) {
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="mt-3 flex items-center justify-between text-sm text-muted">
      <span>
        {total === 0 ? "Sin resultados" : `${offset + 1}–${Math.min(offset + limit, total)} de ${total}`}
      </span>
      <div className="flex gap-2">
        <Button variant="ghost" disabled={page <= 1} onClick={() => onPage(Math.max(0, offset - limit))}>
          Anterior
        </Button>
        <span className="self-center tabular-nums">
          {page} / {pages}
        </span>
        <Button variant="ghost" disabled={page >= pages} onClick={() => onPage(offset + limit)}>
          Siguiente
        </Button>
      </div>
    </div>
  );
}
