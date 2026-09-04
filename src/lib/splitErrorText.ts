/**
 * Traduce un `SplitError` del dominio a un mensaje para la persona: en el idioma
 * de la interfaz y con los importes formateados en la moneda del grupo (nunca en
 * unidades mínimas internas).
 */
import type { TFunction } from "i18next";
import { isSplitError } from "@/domain/splitErrors";
import type { CurrencyCode } from "@/domain/types";
import { formatMoney } from "@/lib/format";
import type { Lang } from "@/i18n/config";

export function splitErrorText(
  err: unknown,
  t: TFunction,
  { currency, lang }: { currency: CurrencyCode; lang: Lang },
): string {
  if (!isSplitError(err)) {
    return err instanceof Error ? err.message : String(err);
  }
  const money = (minor: number | undefined) =>
    formatMoney(minor ?? 0, currency, lang);

  switch (err.code) {
    case "noParticipants":
      return t("errors:splitNoParticipants");
    case "amountNegative":
      return t("errors:splitAmountNegative");
    case "amountMismatch":
      return t("errors:splitAmountMismatch", {
        assigned: money(err.params.assignedMinor),
        total: money(err.params.totalMinor),
      });
    case "percentSum":
      return t("errors:splitPercentSum", {
        sum: formatPercent(err.params.sum ?? 0, lang),
      });
    case "percentZero":
      return t("errors:splitPercentZero");
    case "percentNegative":
      return t("errors:splitPercentNegative");
    case "sharesZero":
      return t("errors:splitSharesZero");
    case "sharesNegative":
      return t("errors:splitSharesNegative");
  }
}

/** "110" · "33,33" — sin ceros decimales de relleno. */
export function formatPercent(value: number, lang: Lang): string {
  return new Intl.NumberFormat(lang === "en" ? "en-US" : "es-AR", {
    maximumFractionDigits: 2,
  }).format(value);
}
