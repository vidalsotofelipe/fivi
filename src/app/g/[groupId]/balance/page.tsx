"use client";

/** Pantalla 12 — saldos. */
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { BottomNav } from "@/components/BottomNav";
import { LinkButton } from "@/components/Button";
import { Loading } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { BalanceRow, TransferRow } from "@/components/ui/cards";
import { useGroupContext } from "@/components/GroupProvider";
import { useMe } from "@/data/settings";
import { useGroupSummary } from "@/lib/db-hooks";
import { useHydrated } from "@/lib/useHydrated";

export default function BalancesPage() {
  const { t } = useTranslation(["payment", "group", "common"]);
  const { group, allParticipants } = useGroupContext();
  const hydrated = useHydrated();
  const summary = useGroupSummary(group.id);
  const me = useMe(group.id);

  const cc = group.currency_code;
  const back = `/g/${group.id}`;
  const bottomNav = <BottomNav groupId={group.id} />;

  if (!hydrated || summary === undefined || me === undefined) {
    return (
      <AppShell title={t("payment:balancesTitle")} back={back} bottomNav={bottomNav}>
        <Loading />
      </AppShell>
    );
  }

  const myBalance =
    me != null
      ? summary.balances.find((b) => b.participant_id === me)
      : undefined;
  const myAmount = myBalance?.balance_minor ?? 0;

  return (
    <AppShell title={t("payment:balancesTitle")} back={back} bottomNav={bottomNav}>
      {myBalance ? (
        <section className="rounded-md border border-border bg-surface-raised p-5">
          <p className="text-sm text-muted">
            {myAmount > 0
              ? t("payment:youReceive")
              : myAmount < 0
                ? t("payment:youPay")
                : t("payment:settledUp")}
          </p>
          {myAmount !== 0 ? (
            <p className="mt-1 text-3xl font-semibold">
              <Money minor={Math.abs(myAmount)} currency={cc} />
            </p>
          ) : null}
        </section>
      ) : (
        <p className="text-sm text-muted">{t("payment:balancesIntro")}</p>
      )}

      {summary.balances.length > 0 ? (
        <ul className="divide-y divide-border">
          {[...summary.balances]
            .sort((a, b) => b.balance_minor - a.balance_minor)
            .map((b) => (
              <BalanceRow
                key={b.participant_id}
                balance={b}
                participants={allParticipants}
                currency={cc}
                highlight={b.participant_id === me}
              />
            ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">{t("group:noMovements")}</p>
      )}

      {summary.transfers.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="label-caps">
            {t("payment:suggestionsTitle")}
          </h2>
          <ul className="flex flex-col gap-2">
            {summary.transfers.map((tr, i) => (
              <TransferRow
                key={`${tr.from_id}-${tr.to_id}-${i}`}
                transfer={tr}
                participants={allParticipants}
                currency={cc}
                groupId={group.id}
              />
            ))}
          </ul>
          <p className="text-xs text-muted">{t("payment:suggestionsHint")}</p>
        </section>
      ) : null}

      <LinkButton
        href={`/g/${group.id}/pagos/nuevo`}
        full
        variant="secondary"
        className="mt-2"
      >
        {t("group:registerPayment")}
      </LinkButton>
    </AppShell>
  );
}
