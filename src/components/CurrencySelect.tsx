"use client";

import { useMemo, useState } from "react";
import { listCurrencies } from "@/domain/currencies";
import type { CurrencyCode } from "@/domain/types";
import { cn } from "@/lib/cn";
import { TextInput } from "./fields";

/**
 * Selector de moneda con búsqueda por nombre o código (secciones 2 y 29).
 * Muestra siempre "CÓDIGO — Nombre".
 */
export function CurrencySelect({
  value,
  onChange,
  disabled,
}: {
  value: CurrencyCode | "";
  onChange: (code: CurrencyCode) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const all = useMemo(() => listCurrencies(), []);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (c) =>
        c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q),
    );
  }, [all, query]);

  return (
    <div className="flex flex-col gap-2">
      <TextInput
        type="search"
        placeholder="Buscar moneda…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        disabled={disabled}
      />
      <ul className="max-h-56 divide-y divide-black/5 overflow-y-auto rounded-xl border border-black/10 dark:divide-white/10 dark:border-white/15">
        {filtered.map((c) => (
          <li key={c.code}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(c.code)}
              className={cn(
                "flex w-full items-center gap-3 px-3.5 py-3 text-left text-[15px] hover:bg-black/5 disabled:pointer-events-none dark:hover:bg-white/10",
                value === c.code && "bg-black/5 dark:bg-white/10",
              )}
            >
              <span className="w-10 font-semibold">{c.code}</span>
              <span className="opacity-70">{c.name}</span>
              {value === c.code ? (
                <span className="ml-auto text-sm">✓</span>
              ) : null}
            </button>
          </li>
        ))}
        {filtered.length === 0 ? (
          <li className="px-3.5 py-3 text-sm opacity-50">Sin resultados</li>
        ) : null}
      </ul>
    </div>
  );
}
