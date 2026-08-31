"use client";

/** Pantalla 13 — registrar pago entre participantes. */
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { Button, LinkButton } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { nameOf } from "@/components/ui/cards";
import { TextField } from "@/components/ui/TextField";
import { DateField, MoneyField, SelectField } from "@/components/ui/formfields";
import { FormError } from "@/components/fields";
import { StickyActionBar } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useGroupContext } from "@/components/GroupProvider";
import { db } from "@/data/db";
import { createPayment } from "@/data/repositories/paymentRepo";
import { minorToRawInput } from "@/domain/money";
import { parseAmount } from "@/components/MoneyInput";
import { useGroupSummary } from "@/lib/db-hooks";
import { todayIso } from "@/lib/format";

export default function NewPaymentPage() {
  return (
    <Suspense fallback={null}>
      <NewPaymentForm />
    </Suspense>
  );
}

function NewPaymentForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { t } = useTranslation(["payment", "common", "errors"]);
  const { group, participants } = useGroupContext();
  const summary = useGroupSummary(group.id);
  const toast = useToast();
  const cc = group.currency_code;

  const preset = Number(params.get("amount"));
  const [from, setFrom] = useState(
    params.get("from") ?? participants[0]?.id ?? "",
  );
  const [to, setTo] = useState(params.get("to") ?? participants[1]?.id ?? "");
  const [amountRaw, setAmountRaw] = useState(
    Number.isFinite(preset) && preset > 0 ? minorToRawInput(preset, cc) : "",
  );
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountMinor = parseAmount(amountRaw, cc);

  const preview = useMemo(() => {
    if (!summary || amountMinor == null || from === to) return null;
    const bal = (id: string) =>
      summary.balances.find((b) => b.participant_id === id)?.balance_minor ?? 0;
    return {
      fromBefore: bal(from),
      fromAfter: bal(from) + amountMinor,
      toBefore: bal(to),
      toAfter: bal(to) - amountMinor,
    };
  }, [summary, amountMinor, from, to]);

  if (participants.length < 2) {
    return (
      <AppShell title={t("payment:title")} back={`/g/${group.id}`} showSync={false}>
        <EmptyState
          title={t("errors:samePerson")}
          action={
            <LinkButton href={`/g/${group.id}/personas`}>
              {t("payment:payerLabel")}
            </LinkButton>
          }
        />
      </AppShell>
    );
  }

  const canSubmit =
    from !== "" && to !== "" && from !== to && amountMinor != null && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || amountMinor == null) return;
    setBusy(true);
    setError(null);
    try {
      await createPayment(
        {
          group_id: group.id,
          from_participant: from,
          to_participant: to,
          amount_minor_units: amountMinor,
          payment_date: date,
        },
        db,
      );
      router.replace(`/g/${group.id}`);
      toast({ message: t("payment:savedToast") });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <AppShell title={t("payment:title")} back={`/g/${group.id}`} showSync={false}>
      <form onSubmit={submit} className="flex flex-1 flex-col gap-4">
        {error ? <FormError messages={[error]} /> : null}

        <SelectField
          label={t("payment:payerLabel")}
          hint={t("payment:payerHint")}
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        >
          {participants.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </SelectField>

        <SelectField
          label={t("payment:receiverLabel")}
          hint={t("payment:receiverHint")}
          error={from === to ? t("errors:samePerson") : null}
          value={to}
          onChange={(e) => setTo(e.target.value)}
        >
          {participants.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </SelectField>

        <MoneyField
          label={t("payment:amountLabel")}
          hint={t("payment:amountHint")}
          currency={cc}
          value={amountRaw}
          onChange={setAmountRaw}
        />

        <DateField
          label={t("payment:dateLabel")}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />

        <TextField
          label={t("payment:noteLabel")}
          placeholder={t("payment:notePlaceholder")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        {preview ? (
          <section className="rounded-md border border-border bg-surface-raised p-4 text-sm">
            <p className="font-medium text-text">
              {t("payment:resultingBalance")}
            </p>
            <div className="mt-2 flex flex-col gap-1">
              <div className="flex justify-between">
                <span className="text-muted">
                  {nameOf(participants, from)} ({t("payment:before")}{" "}
                  <Money minor={preview.fromBefore} currency={cc} signed />)
                </span>
                <Money minor={preview.fromAfter} currency={cc} signed />
              </div>
              <div className="flex justify-between">
                <span className="text-muted">
                  {nameOf(participants, to)} ({t("payment:before")}{" "}
                  <Money minor={preview.toBefore} currency={cc} signed />)
                </span>
                <Money minor={preview.toAfter} currency={cc} signed />
              </div>
            </div>
          </section>
        ) : null}

        <StickyActionBar>
          <Button type="submit" full loading={busy} disabled={!canSubmit}>
            {t("payment:confirm")}
          </Button>
        </StickyActionBar>
      </form>
    </AppShell>
  );
}
