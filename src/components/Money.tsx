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
      <span className={cn("tabular-nums", className)}>
        {formatMoney(minor, currency, lang)}
      </span>
    );
  }

  const tone =
    minor > 0 ? "text-accent" : minor < 0 ? "text-danger" : "text-muted";
  const sign = minor > 0 ? "+" : minor < 0 ? "−" : "";
  return (
    <span className={cn("tabular-nums", tone, className)}>
      {sign}
      {formatMoney(Math.abs(minor), currency, lang)}
    </span>
  );
}
