import { formatMoney } from "@/domain/money";
import type { CurrencyCode } from "@/domain/types";
import { cn } from "@/lib/cn";

/** Muestra un importe (unidades mínimas) formateado según la moneda. */
export function MoneyText({
  minor,
  currency,
  signed,
  className,
}: {
  minor: number;
  currency: CurrencyCode;
  /** Colorea + prefija signo para balances (+ recibe / − paga). */
  signed?: boolean;
  className?: string;
}) {
  const text = formatMoney(Math.abs(minor), currency);
  if (!signed) return <span className={className}>{formatMoney(minor, currency)}</span>;

  const tone =
    minor > 0
      ? "text-emerald-600 dark:text-emerald-400"
      : minor < 0
        ? "text-red-600 dark:text-red-400"
        : "opacity-60";
  const prefix = minor > 0 ? "+" : minor < 0 ? "−" : "";
  return (
    <span className={cn("tabular-nums", tone, className)}>
      {prefix}
      {text}
    </span>
  );
}
