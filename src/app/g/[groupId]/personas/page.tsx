"use client";

/** Pantalla 14 — personas del grupo. */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { AddToPastExpenses } from "@/components/AddToPastExpenses";
import { AddPersonRow } from "@/components/AddPersonRow";
import { BottomNav } from "@/components/BottomNav";
import { EmptyState, Loading } from "@/components/EmptyState";
import { PersonRow } from "@/components/ui/cards";
import { useGroupContext } from "@/components/GroupProvider";
import { db } from "@/data/db";
import { addParticipant } from "@/data/repositories/participantRepo";
import type { Participant } from "@/domain/types";
import { useGroupSummary } from "@/lib/db-hooks";
import { useHydrated } from "@/lib/useHydrated";

export default function PeoplePage() {
  const { t } = useTranslation(["people", "group", "common", "errors"]);
  const { group, participants } = useGroupContext();
  const hydrated = useHydrated();
  const summary = useGroupSummary(group.id);

  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pastFor, setPastFor] = useState<Participant | null>(null);

  const bottomNav = <BottomNav groupId={group.id} />;
  const cc = group.currency_code;

  function balanceOf(id: string): number {
    return (
      summary?.balances.find((b) => b.participant_id === id)?.balance_minor ?? 0
    );
  }

  async function add() {
    const name = value.trim();
    if (!name) {
      setError(t("errors:participantNameRequired"));
      return;
    }
    if (participants.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      setError(t("errors:duplicateParticipant"));
      return;
    }
    setBusy(true);
    try {
      const created = await addParticipant(group.id, name, db);
      setValue("");
      setError(null);
      setPastFor(created);
    } finally {
      setBusy(false);
    }
  }

  if (!hydrated || summary === undefined) {
    return (
      <AppShell
        title={t("people:title")}
        back={`/g/${group.id}`}
        bottomNav={bottomNav}
      >
        <Loading />
      </AppShell>
    );
  }

  const sorted = [...participants].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <AppShell
      title={t("people:title")}
      back={`/g/${group.id}`}
      bottomNav={bottomNav}
    >
      {sorted.length === 0 ? (
        <EmptyState
          title={t("people:emptyTitle")}
          description={t("people:emptyBody")}
        />
      ) : (
        <>
          <p className="-mt-1 text-sm text-muted">
            {t("people:count", { count: sorted.length })}
          </p>
          <ul className="flex flex-col gap-2">
            {sorted.map((p) => (
              <PersonRow
                key={p.id}
                participant={p}
                balanceMinor={balanceOf(p.id)}
                currency={cc}
                groupId={group.id}
              />
            ))}
          </ul>
        </>
      )}

      {pastFor ? (
        <AddToPastExpenses
          groupId={group.id}
          participant={pastFor}
          currency={cc}
          onDone={() => setPastFor(null)}
        />
      ) : null}

      <AddPersonRow
        label={t("people:addPerson")}
        value={value}
        onChange={(v) => {
          setValue(v);
          if (error) setError(null);
        }}
        onSubmit={add}
        busy={busy}
        error={error}
      />
    </AppShell>
  );
}
