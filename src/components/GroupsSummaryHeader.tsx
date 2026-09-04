"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Money } from "@/components/Money";
import { useLocale } from "@/components/LocaleProvider";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import type { GlobalBalance, GroupsSummary } from "@/domain/groupsSummary";

/**
 * Resumen de todos los grupos en el inicio.
 *
 * Dos capas, siempre:
 *  1. **Balance global estimado** en la moneda principal del usuario (si la
 *     configuró y hay más de una moneda). Se calcula convirtiendo el saldo NETO
 *     de cada moneda por separado y sumando — NUNCA se suman monedas distintas
 *     sin convertir. La conversión es sólo para visualización.
 *  2. **Por moneda**: los importes originales (con código ISO, porque "$" es
 *     ambiguo). Esta es la fuente de verdad.
 *
 * Sin moneda principal, o con una sola moneda, se muestra sólo la capa 2 (el
 * comportamiento anterior).
 */
export function GroupsSummaryHeader({
  summary,
  global,
}: {
  summary: GroupsSummary;
  /** Balance consolidado; `null` si no hay moneda principal configurada. */
  global: GlobalBalance | null;
}) {
  const { t } = useTranslation(["onboarding", "group", "common"]);
  const { lang } = useLocale();
  const [showFx, setShowFx] = useState(false);

  if (summary.active_groups === 0) return null;

  const totals = summary.totals;
  const multi = totals.length > 1;
  // Sólo tiene sentido el balance global si hay varias monedas y se pudo
  // convertir al menos una cruzada.
  const showGlobal =
    global != null &&
    multi &&
    (global.converted.length > 0 || global.missing.length > 0);

  return (
    <section
      className="border-2 border-border-strong bg-surface"
      aria-label={t("onboarding:summaryTitle")}
    >
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        <span className="label-caps">{t("onboarding:summaryTitle")}</span>
        {summary.all_settled ? (
          <span className="border-2 border-positive px-2 py-0.5 text-[11px] font-bold uppercase tracking-caps text-positive">
            {t("group:settledUp")}
          </span>
        ) : null}
      </div>

      {/* 1 · Balance global estimado en la moneda principal. */}
      {showGlobal ? (
        <div className="px-4 pb-3 pt-2">
          <p className="label-caps">{t("onboarding:globalBalanceLabel")}</p>
          <p
            className={cn(
              "font-display mt-1 text-[38px] leading-none tracking-tightest",
              global!.balance_minor > 0
                ? "text-positive"
                : global!.balance_minor < 0
                  ? "text-warm-strong"
                  : "text-text",
            )}
          >
            <Money
              minor={Math.abs(global!.balance_minor)}
              currency={global!.currency}
              code
              approx
            />
          </p>
          <p className="mt-1 text-xs text-muted">
            {global!.balance_minor >= 0
              ? t("onboarding:globalBalancePositive")
              : t("onboarding:globalBalanceNegative")}
          </p>
          {global!.missing.length > 0 ? (
            <p className="mt-1 text-xs text-warm-strong">
              {t("onboarding:globalBalanceMissing", {
                list: global!.missing.join(", "),
                count: global!.missing.length,
              })}
            </p>
          ) : null}
          {global!.converted.some((c) => c !== global!.currency) ? (
            <button
              type="button"
              onClick={() => setShowFx((v) => !v)}
              aria-expanded={showFx}
              className="mt-1 flex min-h-touch items-center text-left text-xs text-muted underline underline-offset-2"
            >
              {global!.stale
                ? t("onboarding:fxStale", {
                    date: global!.quoted_at
                      ? formatDate(global!.quoted_at.slice(0, 10), lang)
                      : "—",
                  })
                : t("onboarding:fxInfo")}
            </button>
          ) : null}
          {showFx ? (
            <div className="mt-1 flex flex-col gap-1 text-xs text-faint">
              {/* Fuente, fecha y condición POR MONEDA: no todas vienen del mismo
                  lado. ARS sale del Banco de la Nación (oficial); el resto, de
                  una referencia de mercado. Decirlo es parte del dato
                  (ver docs/FX_SOURCES.md). */}
              <ul className="flex flex-col gap-0.5">
                {global!.rate_sources.map(({ currency, source }) => (
                  <li key={currency}>
                    {t("onboarding:fxSourceLine", {
                      code: currency,
                      provider: source.provider,
                      date: formatDate(source.quoted_at.slice(0, 10), lang),
                      kind: source.official
                        ? t("onboarding:fxOfficial")
                        : t("onboarding:fxAlternative"),
                    })}
                  </li>
                ))}
              </ul>
              {global!.rate_sources.some((s) => !s.source.official) ? (
                <p>{t("onboarding:fxNotOfficialNote")}</p>
              ) : null}
              <p>{t("onboarding:fxMidNote")}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Fallback sin moneda principal / una sola moneda: cifra principal simple. */}
      {!showGlobal ? (
        <div className="px-4 pb-4 pt-2">
          {totals[0] ? (
            <>
              <p className="label-caps">
                {totals[0].net_minor >= 0
                  ? t("group:youAreOwed")
                  : t("group:youOwe")}
              </p>
              <p
                className={cn(
                  "font-display mt-1 text-[38px] leading-none tracking-tightest",
                  totals[0].net_minor >= 0 ? "text-positive" : "text-warm-strong",
                )}
              >
                <Money
                  minor={Math.abs(totals[0].net_minor)}
                  currency={totals[0].currency}
                  code={multi}
                />
              </p>
            </>
          ) : (
            <p className="font-display text-2xl leading-none tracking-tightest text-positive">
              {t("group:settledUp")}
            </p>
          )}
        </div>
      ) : null}

      {/* 2 · Por moneda: importes ORIGINALES, con código ISO. */}
      {totals.length > 0 ? (
        <>
          <p className="border-t-2 border-border px-4 pb-1 pt-2 label-caps">
            {t("onboarding:byCurrency")}
          </p>
          <ul className="divide-y divide-border">
            {totals.map((tot) => (
              <li
                key={tot.currency}
                className="flex items-baseline justify-between gap-2 px-4 py-2 text-sm"
              >
                <span className="label-caps">{tot.currency}</span>
                <span className="flex flex-wrap justify-end gap-x-3 gap-y-0.5">
                  {tot.owed_to_me_minor > 0 ? (
                    <span className="text-positive">
                      {t("group:youAreOwed")}:{" "}
                      <Money minor={tot.owed_to_me_minor} currency={tot.currency} code />
                    </span>
                  ) : null}
                  {tot.i_owe_minor > 0 ? (
                    <span className="text-warm-strong">
                      {t("group:youOwe")}:{" "}
                      <Money minor={tot.i_owe_minor} currency={tot.currency} code />
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <dl className="flex divide-x-2 divide-border border-t-2 border-border">
        <div className="min-w-0 flex-1 px-4 py-3">
          <dt className="label-caps">{t("onboarding:activeGroups")}</dt>
          <dd className="mt-0.5 font-semibold text-text">{summary.active_groups}</dd>
        </div>
      </dl>

      {summary.groups_without_me > 0 ? (
        <p className="border-t-2 border-border px-4 py-2 text-xs text-muted">
          {t("onboarding:summaryMissingMe", { count: summary.groups_without_me })}
        </p>
      ) : null}
    </section>
  );
}
