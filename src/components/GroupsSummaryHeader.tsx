"use client";

import { useTranslation } from "react-i18next";
import { Money } from "@/components/Money";
import { cn } from "@/lib/cn";
import type { GroupsSummary } from "@/domain/groupsSummary";

/**
 * Resumen de todos los grupos en la pantalla de inicio: cuánto te deben, cuánto
 * debés y cuántos grupos activos hay.
 *
 * **Los totales son por moneda.** Un grupo tiene una sola moneda y FIVI no
 * convierte divisas, así que sumar 300 € con 60 £ daría un número falso. Con
 * una sola moneda (el caso normal) se ve como un total único; con varias, una
 * línea por moneda.
 */
export function GroupsSummaryHeader({ summary }: { summary: GroupsSummary }) {
  const { t } = useTranslation(["onboarding", "group", "common"]);

  if (summary.active_groups === 0) return null;

  const [primary, ...rest] = summary.totals;

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

      {/* Cifra principal: lo que te deben en la moneda con más movimiento. */}
      <div className="px-4 pb-4 pt-2">
        {primary ? (
          <>
            <p className="label-caps">
              {primary.owed_to_me_minor > 0
                ? t("group:youAreOwed")
                : t("group:youOwe")}
            </p>
            <p
              className={cn(
                "font-display mt-1 text-[38px] leading-none tracking-tightest",
                primary.owed_to_me_minor > 0 ? "text-positive" : "text-warm-strong",
              )}
            >
              <Money
                minor={
                  primary.owed_to_me_minor > 0
                    ? primary.owed_to_me_minor
                    : primary.i_owe_minor
                }
                currency={primary.currency}
              />
            </p>
          </>
        ) : (
          <p className="font-display text-2xl leading-none tracking-tightest text-positive">
            {t("group:settledUp")}
          </p>
        )}
      </div>

      {/* Detalle: la contraparte de la moneda principal + grupos activos. */}
      <dl className="flex divide-x-2 divide-border border-t-2 border-border">
        <div className="min-w-0 flex-1 px-4 py-3">
          <dt className="label-caps">
            {primary && primary.owed_to_me_minor > 0
              ? t("group:youOwe")
              : t("group:youAreOwed")}
          </dt>
          <dd className="mt-0.5 font-semibold text-warm-strong">
            {primary ? (
              <Money
                minor={
                  primary.owed_to_me_minor > 0
                    ? primary.i_owe_minor
                    : primary.owed_to_me_minor
                }
                currency={primary.currency}
              />
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div className="min-w-0 flex-1 px-4 py-3">
          <dt className="label-caps">{t("onboarding:activeGroups")}</dt>
          <dd className="mt-0.5 font-semibold text-text">
            {summary.active_groups}
          </dd>
        </div>
      </dl>

      {/* Otras monedas: nunca se mezclan con la principal. */}
      {rest.length > 0 ? (
        <ul className="divide-y divide-border border-t-2 border-border">
          {rest.map((tot) => (
            <li
              key={tot.currency}
              className="flex items-baseline justify-between gap-2 px-4 py-2 text-sm"
            >
              <span className="label-caps">{tot.currency}</span>
              <span className="flex gap-3">
                {tot.owed_to_me_minor > 0 ? (
                  <span className="text-positive">
                    +<Money minor={tot.owed_to_me_minor} currency={tot.currency} />
                  </span>
                ) : null}
                {tot.i_owe_minor > 0 ? (
                  <span className="text-warm-strong">
                    −<Money minor={tot.i_owe_minor} currency={tot.currency} />
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {summary.groups_without_me > 0 ? (
        <p className="border-t-2 border-border px-4 py-2 text-xs text-muted">
          {t("onboarding:summaryMissingMe", {
            count: summary.groups_without_me,
          })}
        </p>
      ) : null}
    </section>
  );
}
