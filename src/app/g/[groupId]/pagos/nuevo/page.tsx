"use client";

/** Registrar un pago entre participantes (sección 9). */
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button, LinkButton } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { Field, Select } from "@/components/fields";
import { MoneyInput, parseAmount } from "@/components/MoneyInput";
import { useGroupContext } from "@/components/GroupProvider";
import { db } from "@/data/db";
import { createPayment } from "@/data/repositories/paymentRepo";
import { minorToRawInput } from "@/domain/money";
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
  const { group, participants } = useGroupContext();
  const cc = group.currency_code;

  const presetAmount = Number(params.get("amount"));
  const [from, setFrom] = useState(
    params.get("from") ?? participants[0]?.id ?? "",
  );
  const [to, setTo] = useState(
    params.get("to") ?? participants[1]?.id ?? "",
  );
  const [amountRaw, setAmountRaw] = useState(
    Number.isFinite(presetAmount) && presetAmount > 0
      ? minorToRawInput(presetAmount, cc)
      : "",
  );
  const [date, setDate] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (participants.length < 2) {
    return (
      <AppShell title="Registrar pago" back={`/g/${group.id}`}>
        <EmptyState
          title="Necesitás al menos dos participantes"
          action={
            <LinkButton href={`/g/${group.id}/config`}>
              Ir a Configuración
            </LinkButton>
          }
        />
      </AppShell>
    );
  }

  const amountMinor = parseAmount(amountRaw, cc);
  const canSubmit =
    from !== "" && to !== "" && from !== to && amountMinor !== null && !busy;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || amountMinor === null) return;
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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <AppShell title="Registrar pago" back={`/g/${group.id}`}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Paga">
          <Select value={from} onChange={(e) => setFrom(e.target.value)}>
            {participants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Recibe"
          error={from === to ? "Elegí dos personas distintas" : null}
        >
          <Select value={to} onChange={(e) => setTo(e.target.value)}>
            {participants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Monto">
          <MoneyInput currency={cc} value={amountRaw} onChange={setAmountRaw} />
        </Field>

        <Field label="Fecha">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-xl border border-black/10 bg-white px-3.5 py-3 text-[15px] outline-none focus:border-black/30 dark:border-white/15 dark:bg-white/5"
          />
        </Field>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <Button type="submit" full disabled={!canSubmit}>
          {busy ? "Guardando…" : "Registrar pago"}
        </Button>
      </form>
    </AppShell>
  );
}
