"use client";

/** Pantalla 14 (detalle) — una persona del grupo. */
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { Button, LinkButton } from "@/components/Button";
import { EmptyState, Loading } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { ExpenseCard } from "@/components/ui/cards";
import { ConfirmDialog } from "@/components/ui/overlays";
import { useToast } from "@/components/ui/toast";
import { useGroupContext } from "@/components/GroupProvider";
import { db } from "@/data/db";
import { listGroupShares } from "@/data/repositories/expenseRepo";
import { removeParticipant } from "@/data/repositories/participantRepo";
import { useMe, setMe } from "@/data/settings";
import { useExpenses, useGroupSummary } from "@/lib/db-hooks";
import { useHydrated } from "@/lib/useHydrated";

export default function PersonDetailPage() {
  const router = useRouter();
  const { t } = useTranslation(["people", "common"]);
  const { group, participants } = useGroupContext();
  const { participantId } = useParams<{ participantId: string }>();
  const hydrated = useHydrated();
  const summary = useGroupSummary(group.id);
  const expenses = useExpenses(group.id);
  const shares = useLiveQuery(() => listGroupShares(group.id, db), [group.id]);
  const me = useMe(group.id);
  const toast = useToast();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  const cc = group.currency_code;
  const back = `/g/${group.id}/personas`;
  const person = participants.find((p) => p.id === participantId);

  const theirExpenses = useMemo(() => {
    if (!expenses || !shares) return [];
    const inExpense = new Set(
      shares
        .filter((s) => s.participant_id === participantId)
        .map((s) => s.expense_id),
    );
    return expenses.filter(
      (e) => e.paid_by === participantId || inExpense.has(e.id),
    );
  }, [expenses, shares, participantId]);

  if (
    !hydrated ||
    summary === undefined ||
    expenses === undefined ||
    shares === undefined
  ) {
    return (
      <AppShell title={t("people:title")} back={back}>
        <Loading />
      </AppShell>
    );
  }

  if (!person) {
    return (
      <AppShell title={t("people:title")} back={back}>
        <EmptyState
          title={t("people:emptyTitle")}
          action={
            <LinkButton href={back}>{t("people:backToPeople")}</LinkButton>
          }
        />
      </AppShell>
    );
  }

  const bal = summary.balances.find((b) => b.participant_id === participantId);
  const paid = bal?.paid_minor ?? 0;
  const share = bal?.owed_minor ?? 0;
  const balance = bal?.balance_minor ?? 0;

  async function remove() {
    setRemoving(true);
    await removeParticipant(participantId, db);
    if (me === participantId) await setMe(group.id, null);
    router.replace(back);
    toast({ message: t("people:removedToast", { name: person!.name }) });
  }

  return (
    <AppShell title={t("people:detailTitle", { name: person.name })} back={back}>
      <section className="grid grid-cols-3 gap-2">
        <Stat label={t("people:paid")}>
          <Money minor={paid} currency={cc} />
        </Stat>
        <Stat label={t("people:share")}>
          <Money minor={share} currency={cc} />
        </Stat>
        <Stat label={t("people:balance")}>
          <Money minor={balance} currency={cc} signed={balance !== 0} />
        </Stat>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="label-caps">
          {t("people:theirExpenses")}
        </h2>
        {theirExpenses.length === 0 ? (
          <p className="text-sm text-muted">{t("people:noExpenses")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {theirExpenses.map((e) => (
              <ExpenseCard
                key={e.id}
                expense={e}
                participants={participants}
                currency={cc}
                groupId={group.id}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="mt-2 border-t border-border pt-4">
        <Button
          variant="ghost"
          className="text-danger"
          onClick={() => setConfirmOpen(true)}
        >
          {t("people:removePerson")}
        </Button>
      </section>

      <ConfirmDialog
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={remove}
        title={t("people:removeConfirmTitle", { name: person.name })}
        body={t("people:removeConfirmBody")}
        confirmLabel={t("common:delete")}
        cancelLabel={t("common:cancel")}
        busy={removing}
      />
    </AppShell>
  );
}

function Stat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-md border border-border bg-surface px-2 py-3 text-center">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-sm font-medium tabular-nums">{children}</span>
    </div>
  );
}
