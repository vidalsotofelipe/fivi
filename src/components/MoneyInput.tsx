"use client";

import { formatMoney, toMinorUnits } from "@/domain/money";
import type { CurrencyCode } from "@/domain/types";
import { TextInput } from "./fields";

/**
 * Entrada de monto. Guarda el texto crudo; el parseo a unidades mínimas lo hace
 * `toMinorUnits` con la moneda del grupo. No se pide moneda por gasto
 * (sección 4): se muestra el código como prefijo informativo.
 */
export function MoneyInput({
  currency,
  value,
  onChange,
}: {
  currency: CurrencyCode;
  value: string;
  onChange: (raw: string) => void;
}) {
  let preview: string | null = null;
  if (value.trim()) {
    try {
      preview = formatMoney(toMinorUnits(value, currency), currency);
    } catch {
      preview = null;
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-stretch gap-2">
        <span className="flex items-center rounded-xl bg-black/5 px-3 text-sm font-semibold opacity-70 dark:bg-white/10">
          {currency}
        </span>
        <TextInput
          inputMode="decimal"
          placeholder="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      <span className="min-h-4 text-xs opacity-60">
        {preview ? `= ${preview}` : value.trim() ? "Monto inválido" : ""}
      </span>
    </div>
  );
}

/** Devuelve el monto en unidades mínimas o `null` si el texto no es válido. */
export function parseAmount(
  raw: string,
  currency: CurrencyCode,
): number | null {
  try {
    const minor = toMinorUnits(raw, currency);
    return minor > 0 ? minor : null;
  } catch {
    return null;
  }
}
