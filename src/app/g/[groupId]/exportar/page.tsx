"use client";

/** Exportar los datos del grupo a CSV. Se llega desde "Más". */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { useGroupContext } from "@/components/GroupProvider";
import { useLocale } from "@/components/LocaleProvider";
import { db } from "@/data/db";
import { listExpenses, listGroupShares } from "@/data/repositories/expenseRepo";
import { listPayments } from "@/data/repositories/paymentRepo";
import { buildGroupCsv, csvFileName } from "@/lib/exportCsv";

export default function ExportGroupPage() {
  const { t } = useTranslation(["group", "expense", "payment", "common"]);
  const { lang } = useLocale();
  const { group, participants } = useGroupContext();
  const [downloading, setDownloading] = useState(false);

  async function handleExport() {
    setDownloading(true);
    try {
      const [expenses, shares, payments] = await Promise.all([
        listExpenses(group.id, db),
        listGroupShares(group.id, db),
        listPayments(group.id, db),
      ]);
      const csv = buildGroupCsv({
        group,
        participants,
        expenses,
        shares,
        payments,
        lang,
        labels: {
          groupLabel: t("group:exportGroupLabel"),
          currencyLabel: t("settings:sectionCurrency"),
          expensesSection: t("group:exportExpensesSection"),
          paymentsSection: t("group:exportPaymentsSection"),
          date: t("expense:dateLabel"),
          description: t("expense:descriptionLabel"),
          amount: t("expense:amountLabel"),
          paidBy: t("expense:payerLabel"),
          from: t("payment:payerLabel"),
          to: t("payment:receiverLabel"),
          noExpenses: t("group:exportNoExpenses"),
          noPayments: t("group:exportNoPayments"),
        },
      });

      // BOM para que Excel detecte UTF-8 (tildes/eñes en descripciones y nombres).
      const blob = new Blob(["﻿" + csv], {
        type: "text/csv;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = csvFileName(group.name);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <AppShell title={t("group:exportTitle")} back={`/g/${group.id}/mas`}>
      <section className="flex flex-col gap-3">
        <p className="text-sm text-muted">{t("group:exportHint")}</p>
        <Button onClick={handleExport} loading={downloading}>
          {t("group:exportButton")}
        </Button>
      </section>
    </AppShell>
  );
}
