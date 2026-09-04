"use client";

/** Pantalla 05 — resumen del grupo. */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { BottomNav } from "@/components/BottomNav";
import { LinkButton } from "@/components/Button";
import { Loading } from "@/components/EmptyState";
import { MePicker } from "@/components/MePicker";
import { Money } from "@/components/Money";
import {
  BalanceCard,
  BalanceRow,
  ExpenseCard,
  TransferRow,
  nameOf,
} from "@/components/ui/cards";
import { Card } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useGroupContext } from "@/components/GroupProvider";
import { useSyncState } from "@/components/SyncProvider";
import { useSyncStatus } from "@/components/useSyncStatus";
import { useLocale } from "@/components/LocaleProvider";
import { db } from "@/data/db";
import { restoreGroup } from "@/data/repositories/groupRepo";
import { useMe } from "@/data/settings";
import { useGroupSummary } from "@/lib/db-hooks";
import { formatDate, minutesSince } from "@/lib/format";
import { useHydrated } from "@/lib/useHydrated";

/**
 * "Sincronizado hace X" en el resumen. Sólo se muestra cuando **todo** está al
 * día: si hay pendientes o un error, el badge de la barra y el banner ya lo
 * dicen (y con más detalle), así que repetirlo acá sólo agrega ruido — y decir
 * "sincronizado recién" mientras hay 19 cambios rechazados sería mentira.
 */
function SyncLine() {
  const { t } = useTranslation("sync");
  const { kind, fullySynced } = useSyncStatus();
  const { last_synced_at } = useSyncState();

  if (kind === "local") return <span>{t("onDevice")}</span>;
  if (!fullySynced) return null;
  if (!last_synced_at) return <span>{t("synced")}</span>;
  const mins = minutesSince(last_synced_at);
  return (
    <span>
      {mins < 1 ? t("syncedJustNow") : t("syncedAgo", { count: mins })}
    </span>
  );
}

export default function GroupSummaryPage() {
  const { t } = useTranslation([
    "group",
    "archive",
    "activity",
    "common",
    "expense",
  ]);
  const { lang } = useLocale();
  const router = useRouter();
  const toast = useToast();
  const { group, participants, allParticipants } = useGroupContext();
  const hydrated = useHydrated();
  const summary = useGroupSummary(group.id);
  const me = useMe(group.id);
  const [pickMe, setPickMe] = useState(false);
  const joinHandled = useRef(false);

  // Recién llegado por invitación (`?join=1`): antes de nada, elegir quién sos
  // (o sumarte). Se abre el selector una vez y se limpia el parámetro para que
  // recargar no lo vuelva a abrir.
  useEffect(() => {
    if (joinHandled.current || me === undefined) return;
    const isJoin =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("join") === "1";
    if (!isJoin) return;
    joinHandled.current = true;
    if (me == null) setPickMe(true);
    router.replace(`/g/${group.id}`);
  }, [me, group.id, router]);

  const cc = group.currency_code;
  const bottomNav = <BottomNav groupId={group.id} />;

  if (!hydrated || summary === undefined || me === undefined) {
    return (
      <AppShell title={group.name} back="/" bottomNav={bottomNav}>
        <Loading />
      </AppShell>
    );
  }

  const myBalance =
    me != null
      ? summary.balances.find((b) => b.participant_id === me)
      : undefined;
  const myAmount = myBalance?.balance_minor ?? 0;
  const statusLabel =
    myAmount > 0
      ? t("group:inYourFavor")
      : myAmount < 0
        ? t("group:youOwe")
        : t("group:settledUp");

  return (
    <AppShell title={group.name} back="/" bottomNav={bottomNav}>
      <p className="-mt-2 flex items-center gap-1.5 text-xs text-muted">
        <span aria-hidden="true" className="h-2 w-2 bg-accent" />
        <SyncLine />
      </p>

      {group.archived_at ? (
        <div className="flex items-center justify-between gap-3 border-2 border-warm bg-warm-weak px-4 py-3 text-sm">
          <span className="min-w-0 text-muted">{t("archive:bannerBody")}</span>
          <button
            type="button"
            className="min-h-touch shrink-0 font-medium text-accent"
            onClick={async () => {
              await restoreGroup(group.id, db);
              toast({
                message: t("archive:restoredToast", { name: group.name }),
              });
            }}
          >
            {t("archive:restore")}
          </button>
        </div>
      ) : null}

      {myBalance ? (
        <BalanceCard
          amountMinor={myAmount}
          currency={cc}
          caption={t("group:yourBalance")}
          statusLabel={statusLabel}
        />
      ) : (
        <Card raised className="text-center">
          <p className="text-xs uppercase tracking-wide text-muted">
            {t("group:totalSpent")} · {cc}
          </p>
          <p className="mt-1 text-3xl font-semibold">
            <Money minor={summary.total_spent_minor} currency={cc} />
          </p>
          {participants.length > 0 ? (
            <button
              onClick={() => setPickMe(true)}
              className="mt-2 text-sm font-medium text-accent underline-offset-2 hover:underline"
            >
              {t("group:whoAreYou")}
            </button>
          ) : null}
        </Card>
      )}

      <div className="flex flex-col gap-2">
        <LinkButton href={`/g/${group.id}/gastos/nuevo`} full>
          {t("group:addExpense")}
        </LinkButton>
        <LinkButton
          href={`/g/${group.id}/pagos/nuevo`}
          full
          variant="secondary"
        >
          {t("group:registerPayment")}
        </LinkButton>
      </div>

      {participants.length === 0 ? (
        <div className="border-2 border-warm bg-warm-weak px-4 py-3 text-sm">
          {t("group:participantsQuestion")}{" "}
          <Link
            href={`/g/${group.id}/personas`}
            className="font-medium text-accent underline"
          >
            {t("group:participantsLabel")}
          </Link>
        </div>
      ) : null}

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="label-caps">
            {t("group:whoOwesWho")}
          </h2>
        </div>
        {summary.transfers.length === 0 ? (
          <p className="border-2 border-border bg-surface-raised px-4 py-3 text-sm text-muted">
            {t("group:settledUp")}
          </p>
        ) : (
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
        ) : null}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="label-caps">
            {t("group:recentActivity")}
          </h2>
          <Link
            href={`/g/${group.id}/actividad`}
            className="flex min-h-touch items-center px-1 text-xs text-muted underline"
          >
            {t("common:seeAll")}
          </Link>
        </div>
        {summary.recent.length === 0 ? (
          <p className="text-sm text-muted">{t("group:noMovements")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {summary.recent.map((item) =>
              item.type === "expense" ? (
                <ExpenseCard
                  key={item.data.id}
                  expense={item.data}
                  participants={allParticipants}
                  currency={cc}
                  groupId={group.id}
                />
              ) : (
                <li
                  key={item.data.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface px-4 py-3"
                >
                  <span className="min-w-0 text-[15px] text-text">
                    {t("activity:paymentCreated", {
                      from: nameOf(allParticipants, item.data.from_participant),
                      to: nameOf(allParticipants, item.data.to_participant),
                    })}
                    <span className="block text-xs text-muted">
                      {formatDate(item.data.payment_date, lang)}
                    </span>
                  </span>
                  <Money
                    minor={item.data.amount_minor_units}
                    currency={cc}
                    className="shrink-0"
                  />
                </li>
              ),
            )}
          </ul>
        )}
      </section>

      <MePicker
        open={pickMe}
        onClose={() => setPickMe(false)}
        groupId={group.id}
        currency={cc}
        participants={participants}
        currentId={me ?? null}
      />
    </AppShell>
  );
}
