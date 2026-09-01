"use client";

/** Pantalla 07 — detalle del gasto. */
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { IconButton, LinkButton } from "@/components/Button";
import { EmptyState, Loading } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { nameOf } from "@/components/ui/cards";
import { BottomSheet, ConfirmDialog } from "@/components/ui/overlays";
import { useToast } from "@/components/ui/toast";
import { useGroupContext } from "@/components/GroupProvider";
import { useLocale } from "@/components/LocaleProvider";
import { db } from "@/data/db";
import { deleteExpense } from "@/data/repositories/expenseRepo";
import { splitStrategyLabel } from "@/domain/split";
import { formatDate } from "@/lib/format";
import { useExpenseWithShares } from "@/lib/db-hooks";
import { useHydrated } from "@/lib/useHydrated";

export default function ExpenseDetailPage() {
  const router = useRouter();
  const { t } = useTranslation(["expense", "common"]);
  const { lang } = useLocale();
  const { group, participants } = useGroupContext();
  const { expenseId } = useParams<{ expenseId: string }>();
  const hydrated = useHydrated();
  const data = useExpenseWithShares(expenseId);
  const toast = useToast();

  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const cc = group.currency_code;
  const back = `/g/${group.id}/gastos`;

  if (!hydrated || data === undefined) {
    return (
      <AppShell title={t("expense:detailTitle")} back={back}>
        <Loading />
      </AppShell>
    );
  }

  if (data.expense === null) {
    return (
      <AppShell title={t("expense:detailTitle")} back={back}>
        <EmptyState
          title={t("expense:noResults")}
          action={<LinkButton href={back}>{t("expense:listTitle")}</LinkButton>}
        />
      </AppShell>
    );
  }

  const e = data.expense;
  const edited = e.updated_at.slice(0, 10) !== e.created_at.slice(0, 10);

  const menu = (
    <IconButton label={t("common:edit")} onClick={() => setMenuOpen(true)}>
      <span aria-hidden="true">⋯</span>
    </IconButton>
  );

  return (
    <AppShell title={e.description} back={back} menu={menu}>
      <section className="rounded-md border border-border bg-surface-raised p-4">
        <p className="text-3xl font-semibold">
          <Money minor={e.amount_minor_units} currency={cc} />
        </p>
        <p className="mt-1 text-sm text-muted">
          {formatDate(e.expense_date, lang)} ·{" "}
          {t("expense:paidBy", { name: nameOf(participants, e.paid_by) })}
        </p>
        {edited ? (
          <p className="mt-1 text-xs text-muted">
            {t("expense:editedOn", { date: formatDate(e.updated_at, lang) })}
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="label-caps">
          {t("expense:splitLabel")} · {splitStrategyLabel(e.split_strategy)}
        </h2>
        <ul className="divide-y divide-border rounded-md border border-border">
          {data.shares.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between px-4 py-2.5 text-[15px]"
            >
              <span className="text-text">
                {nameOf(participants, s.participant_id)}
              </span>
              <Money minor={s.share_minor_units} currency={cc} />
            </li>
          ))}
        </ul>
      </section>

      <BottomSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={e.description}
      >
        <ul className="flex flex-col">
          <li>
            <LinkButton
              href={`/g/${group.id}/gastos/${e.id}/editar`}
              variant="ghost"
              full
              className="justify-start"
            >
              {t("expense:editTitle")}
            </LinkButton>
          </li>
          <li>
            <LinkButton
              href={`/g/${group.id}/gastos/nuevo?dup=${e.id}`}
              variant="ghost"
              full
              className="justify-start"
            >
              {t("expense:duplicate")}
            </LinkButton>
          </li>
          <li>
            <button
              onClick={() => {
                setMenuOpen(false);
                setConfirmOpen(true);
              }}
              className="min-h-touch w-full rounded-md px-4 text-left text-[15px] font-medium text-danger hover:bg-danger/10"
            >
              {t("common:delete")}
            </button>
          </li>
        </ul>
      </BottomSheet>

      <ConfirmDialog
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={async () => {
          setDeleting(true);
          await deleteExpense(e.id, db);
          router.replace(back);
          toast({ message: t("expense:deletedToast") });
        }}
        title={t("expense:deleteConfirmTitle", { description: e.description })}
        body={t("expense:deleteConfirmBody")}
        confirmLabel={t("common:delete")}
        cancelLabel={t("common:cancel")}
        busy={deleting}
      />
    </AppShell>
  );
}
