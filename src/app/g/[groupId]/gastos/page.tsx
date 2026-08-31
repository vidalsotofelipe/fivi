"use client";

/** Pantalla 06 — lista de gastos. */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { BottomNav } from "@/components/BottomNav";
import { Button, LinkButton } from "@/components/Button";
import { EmptyState, Loading } from "@/components/EmptyState";
import { ExpenseCard, nameOf } from "@/components/ui/cards";
import { Chip } from "@/components/ui/primitives";
import { TextInput } from "@/components/fields";
import { useGroupContext } from "@/components/GroupProvider";
import { useMe } from "@/data/settings";
import { useExpenses } from "@/lib/db-hooks";
import { useHydrated } from "@/lib/useHydrated";

type Filter = "all" | "mine" | "month";

export default function ExpenseListPage() {
  const { t } = useTranslation(["expense", "common"]);
  const { group, participants } = useGroupContext();
  const hydrated = useHydrated();
  const expenses = useExpenses(group.id);
  const me = useMe(group.id);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    if (!expenses) return [];
    const q = query.trim().toLowerCase();
    const now = new Date();
    return expenses.filter((e) => {
      if (q) {
        const payer = nameOf(participants, e.paid_by).toLowerCase();
        if (
          !e.description.toLowerCase().includes(q) &&
          !payer.includes(q)
        ) {
          return false;
        }
      }
      if (filter === "mine" && me) {
        if (e.paid_by !== me) return false;
      }
      if (filter === "month") {
        const d = new Date(e.expense_date);
        if (
          d.getFullYear() !== now.getFullYear() ||
          d.getMonth() !== now.getMonth()
        ) {
          return false;
        }
      }
      return true;
    });
  }, [expenses, query, filter, me, participants]);

  const bottomNav = <BottomNav groupId={group.id} />;

  if (!hydrated || expenses === undefined) {
    return (
      <AppShell title={t("expense:listTitle")} back={`/g/${group.id}`} bottomNav={bottomNav}>
        <Loading />
      </AppShell>
    );
  }

  return (
    <AppShell
      title={t("expense:listTitle")}
      back={`/g/${group.id}`}
      bottomNav={bottomNav}
    >
      {expenses.length > 0 ? (
        <>
          <TextInput
            type="search"
            placeholder={t("expense:searchPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Chip
              selected={filter === "all"}
              onClick={() => setFilter("all")}
            >
              {t("expense:filterAll")}
            </Chip>
            {me ? (
              <Chip
                selected={filter === "mine"}
                onClick={() => setFilter("mine")}
              >
                {t("expense:filterMine")}
              </Chip>
            ) : null}
            <Chip
              selected={filter === "month"}
              onClick={() => setFilter("month")}
            >
              {t("expense:filterThisMonth")}
            </Chip>
          </div>
        </>
      ) : null}

      {expenses.length === 0 ? (
        <EmptyState
          title={t("expense:emptyTitle")}
          description={t("expense:emptyBody")}
          action={
            <LinkButton href={`/g/${group.id}/gastos/nuevo`}>
              {t("group:addFirstExpense")}
            </LinkButton>
          }
        />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-sm text-muted">{t("expense:noResults")}</p>
          <Button
            variant="ghost"
            onClick={() => {
              setQuery("");
              setFilter("all");
            }}
          >
            {t("common:clearSearch")}
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-2 pb-2">
          {filtered.map((e) => (
            <ExpenseCard
              key={e.id}
              expense={e}
              participants={participants}
              currency={group.currency_code}
              groupId={group.id}
            />
          ))}
        </ul>
      )}

      {filtered.length > 0 ? (
        <div className="sticky bottom-16 z-10 flex justify-end pt-2">
          <LinkButton
            href={`/g/${group.id}/gastos/nuevo`}
            aria-label={t("expense:addTitle")}
            className="rounded-full px-5 shadow-lg"
          >
            + {t("expense:addTitle")}
          </LinkButton>
        </div>
      ) : null}
    </AppShell>
  );
}
