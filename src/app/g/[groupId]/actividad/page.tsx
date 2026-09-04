"use client";

/** Pantalla 15 — actividad del grupo (derivada de timestamps + tombstones). */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { BottomNav } from "@/components/BottomNav";
import { EmptyState, Loading } from "@/components/EmptyState";
import { ActivityItem } from "@/components/ui/cards";
import { Chip } from "@/components/ui/primitives";
import { SelectField } from "@/components/ui/formfields";
import { useGroupContext } from "@/components/GroupProvider";
import type { ActivityKind } from "@/data/queries";
import { useGroupActivity } from "@/lib/db-hooks";
import { useHydrated } from "@/lib/useHydrated";

type Cat = "all" | "expenses" | "payments" | "people";

const CAT_KINDS: Record<Exclude<Cat, "all">, ActivityKind[]> = {
  expenses: ["expense_created", "expense_updated", "expense_deleted"],
  payments: ["payment_created"],
  people: ["person_added"],
};

export default function ActivityPage() {
  const { t } = useTranslation(["activity", "common"]);
  const { group, participants, allParticipants } = useGroupContext();
  const hydrated = useHydrated();
  const events = useGroupActivity(group.id);

  const [cat, setCat] = useState<Cat>("all");
  const [personId, setPersonId] = useState<string>("");

  const filtered = useMemo(() => {
    if (!events) return [];
    return events.filter((e) => {
      if (cat !== "all" && !CAT_KINDS[cat].includes(e.kind)) return false;
      if (personId && !e.people.includes(personId)) return false;
      return true;
    });
  }, [events, cat, personId]);

  const bottomNav = <BottomNav groupId={group.id} />;

  if (!hydrated || events === undefined) {
    return (
      <AppShell
        title={t("activity:title")}
        back={`/g/${group.id}`}
        bottomNav={bottomNav}
      >
        <Loading />
      </AppShell>
    );
  }

  const cats: { value: Cat; label: string }[] = [
    { value: "all", label: t("activity:filterAll") },
    { value: "expenses", label: t("activity:catExpenses") },
    { value: "payments", label: t("activity:catPayments") },
    { value: "people", label: t("activity:catPeople") },
  ];

  return (
    <AppShell
      title={t("activity:title")}
      back={`/g/${group.id}`}
      bottomNav={bottomNav}
    >
      {events.length === 0 ? (
        <EmptyState title={t("activity:empty")} />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {cats.map((c) => (
              <Chip
                key={c.value}
                selected={cat === c.value}
                onClick={() => setCat(c.value)}
              >
                {c.label}
              </Chip>
            ))}
          </div>

          {participants.length > 0 ? (
            <SelectField
              label={t("activity:filterPerson")}
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
            >
              <option value="">{t("activity:allPeople")}</option>
              {participants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </SelectField>
          ) : null}

          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">
              {t("activity:noResults")}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {filtered.map((e) => (
                <ActivityItem
                  key={e.id}
                  event={e}
                  participants={allParticipants}
                  currency={group.currency_code}
                  groupId={group.id}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </AppShell>
  );
}
