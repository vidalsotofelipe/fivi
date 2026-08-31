"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import { controlClass } from "@/components/fields";

export interface ComboOption<V extends string> {
  value: V;
  label: string;
  /** Texto adicional (código de moneda, etc.). */
  meta?: string;
  /** Términos extra para el filtro además de label/meta. */
  keywords?: string;
}

/**
 * Combobox con búsqueda. Lista siempre visible bajo el campo (no un popup):
 * simple, accesible y sin problemas de foco en mobile.
 */
export function Combobox<V extends string>({
  label,
  options,
  value,
  onChange,
  placeholder,
  error,
  hint,
  disabled,
  maxVisible = 8,
}: {
  label: string;
  options: ComboOption<V>[];
  value: V | "";
  onChange: (v: V) => void;
  placeholder?: string;
  error?: string | null;
  hint?: ReactNode;
  disabled?: boolean;
  maxVisible?: number;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const listId = useId();
  const errId = `${listId}-err`;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) =>
      `${o.label} ${o.meta ?? ""} ${o.keywords ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [options, query]);

  const selected = options.find((o) => o.value === value);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={listId} className="text-sm font-medium text-text">
        {label}
      </label>

      <input
        id={listId}
        type="search"
        role="combobox"
        aria-expanded="true"
        aria-controls={`${listId}-list`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errId : undefined}
        className={cn(controlClass, error && "border-danger")}
        placeholder={placeholder ?? t("search")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        disabled={disabled}
      />

      {selected && !query ? (
        <p className="text-xs text-muted">
          {selected.meta ? `${selected.meta} — ` : ""}
          {selected.label}
        </p>
      ) : null}

      <ul
        id={`${listId}-list`}
        role="listbox"
        className="max-h-60 divide-y divide-border overflow-y-auto rounded-md border border-border"
      >
        {filtered.slice(0, query ? filtered.length : maxVisible).map((o) => {
          const isSel = o.value === value;
          return (
            <li key={o.value} role="option" aria-selected={isSel}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  onChange(o.value);
                  setQuery("");
                }}
                className={cn(
                  "flex min-h-touch w-full items-center gap-3 px-3.5 py-2.5 text-left text-[15px] hover:bg-text/[0.06] disabled:pointer-events-none",
                  isSel && "bg-accent-weak",
                )}
              >
                {o.meta ? (
                  <span className="w-11 shrink-0 font-semibold text-text">
                    {o.meta}
                  </span>
                ) : null}
                <span className="min-w-0 flex-1 truncate text-text">
                  {o.label}
                </span>
                {isSel ? (
                  <span aria-hidden="true" className="text-accent">
                    ✓
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
        {filtered.length === 0 ? (
          <li className="px-3.5 py-3 text-sm text-muted">{t("search")} — 0</li>
        ) : null}
      </ul>

      {error ? (
        <span id={errId} role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : hint ? (
        <span className="text-xs text-muted">{hint}</span>
      ) : null}
    </div>
  );
}
