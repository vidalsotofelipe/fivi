"use client";

import type { CurrencyCode } from "@/domain/types";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { useLocale } from "./LocaleProvider";

/**
 * Importe (unidades mínimas) formateado con el locale de la interfaz y la
 * moneda del grupo. `signed` colorea y prefija +/− para balances, sin depender
 * sólo del color (el signo también lo indica).
 */
export function Money({
  minor,
  currency,
  signed,
  className,
}: {
  minor: number;
  currency: CurrencyCode;
  signed?: boolean;
  className?: string;
}) {
  const { lang } = useLocale();

  if (!signed) {
    return (
      <span className={cn("font-display tabular-nums", className)}>
        {formatMoney(minor, currency, lang)}
      </span>
    );
  }

  // Positivo (a favor) = azul de marca; negativo (debés) = naranja de marca.
  // El signo +/− también lo indica: nunca depende sólo del color.
  const tone =
    minor > 0
      ? "text-accent-strong"
      : minor < 0
        ? "text-warm-strong"
        : "text-faint";
  const sign = minor > 0 ? "+" : minor < 0 ? "−" : "";
  return (
    <span className={cn("font-display tabular-nums", tone, className)}>
      {sign}
      {formatMoney(Math.abs(minor), currency, lang)}
    </span>
  );
}
