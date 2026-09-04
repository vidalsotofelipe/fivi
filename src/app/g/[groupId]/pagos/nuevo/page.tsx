"use client";

/** Pantalla 13 — registrar pago entre participantes (manual o "Saldar"). */
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { Button, LinkButton } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { nameOf } from "@/components/ui/cards";
import { TextField } from "@/components/ui/TextField";
import { DateField, MoneyField, SelectField } from "@/components/ui/formfields";
import { FormError } from "@/components/fields";
import { SegmentedControl, StickyActionBar } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useGroupContext } from "@/components/GroupProvider";
import { db } from "@/data/db";
import { useMe } from "@/data/settings";
import { createPayment, deletePayment } from "@/data/repositories/paymentRepo";
import { formatMoney, minorToRawInput } from "@/domain/money";
import { BCP47 } from "@/i18n/config";
import { useLocale } from "@/components/LocaleProvider";
import { parseAmount } from "@/lib/amount";
import { settleAmountError } from "@/lib/settle";
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
  const { lang } = useLocale();
  const { group, participants, allParticipants } = useGroupContext();
  const summary = useGroupSummary(group.id);
  const me = useMe(group.id);
  const toast = useToast();
  const cc = group.currency_code;

  const preset = Number(params.get("amount"));
  const maxRaw = Number(params.get("max"));
  // `max` presente ⇒ se llegó desde "Saldar": hay una deuda concreta a saldar.
  const maxMinor =
    Number.isFinite(maxRaw) && maxRaw > 0 ? Math.round(maxRaw) : null;

  const fromParam = params.get("from") ?? "";
  const toParam = params.get("to") ?? "";
  // ¿Se llegó desde "Saldar"? Ahí pagador/receptor/monto vienen dados y no se
  // tocan. Si no, NO se preseleccionan personas al azar (evita "Ana → Bruno"):
  // se propone al usuario del dispositivo y a quien le debe, si eso se sabe.
  const cameFromSettle = fromParam !== "" || toParam !== "" || maxMinor != null;

  const [from, setFrom] = useState(fromParam);
  const [to, setTo] = useState(toParam);
  const [touched, setTouched] = useState(false);
  const defaultsApplied = useRef(cameFromSettle);
  const [mode, setMode] = useState<"full" | "partial">("full");

  // Defaults sensatos para el pago manual: pago yo, y le pago a quien le debo.
  // Se aplica una sola vez, cuando ya se conocen `me` y los balances, y sólo si
  // el usuario todavía no eligió nada.
  useEffect(() => {
    if (defaultsApplied.current || touched) return;
    if (me === undefined || summary === undefined) return;
    defaultsApplied.current = true;
    if (!me) return; // sin "yo" en el grupo no se asume ningún pago
    const owedTo = summary.transfers
      .filter((tr) => tr.from_id === me)
      .sort((a, b) => b.amount_minor - a.amount_minor)[0];
    setFrom(me);
    if (owedTo) setTo(owedTo.to_id);
  }, [me, summary, touched]);
  const [amountRaw, setAmountRaw] = useState(
    Number.isFinite(preset) && preset > 0 ? minorToRawInput(preset, cc) : "",
  );
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // En "saldar deuda completa" el monto es el pendiente, fijo.
  const effectiveAmount =
    maxMinor != null && mode === "full" ? maxMinor : parseAmount(amountRaw, cc);

  const amountError = useMemo<string | null>(() => {
    const kind = settleAmountError(effectiveAmount, maxMinor);
    if (kind === "positive") return t("errors:amountPositive");
    if (kind === "over") {
      return t("errors:amountOverDebt", {
        amount: formatMoney(maxMinor ?? 0, cc, BCP47[lang]),
      });
    }
    return null;
  }, [effectiveAmount, maxMinor, cc, lang, t]);

  const preview = useMemo(() => {
    // Un monto inválido (0, o mayor que la deuda) no debe mostrar un "saldo
    // resultante": daría balances imposibles. Se oculta hasta que sea válido.
    if (
      !summary ||
      effectiveAmount == null ||
      effectiveAmount <= 0 ||
      amountError != null ||
      from === "" ||
      to === "" ||
      from === to
    )
      return null;
    const bal = (id: string) =>
      summary.balances.find((b) => b.participant_id === id)?.balance_minor ?? 0;
    return {
      fromBefore: bal(from),
      fromAfter: bal(from) + effectiveAmount,
      toBefore: bal(to),
      toAfter: bal(to) - effectiveAmount,
    };
  }, [summary, effectiveAmount, amountError, from, to]);

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

  /**
   * Opciones de los selectores: los participantes vivos + cualquiera que ya
   * esté elegido aunque lo hayan quitado del grupo (p. ej. se llegó por
   * "Saldar" desde una deuda con alguien que ya no está). Sin esto el selector
   * quedaba vacío y no se podía saldar esa deuda.
   */
  const options = (() => {
    const ids = new Set(participants.map((p) => p.id));
    const extra = allParticipants.filter(
      (p) => !ids.has(p.id) && (p.id === from || p.id === to),
    );
    return [...participants, ...extra];
  })();

  const canSubmit =
    from !== "" &&
    to !== "" &&
    from !== to &&
    effectiveAmount != null &&
    effectiveAmount > 0 &&
    amountError == null &&
    !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || effectiveAmount == null) return;
    setBusy(true);
    setError(null);
    try {
      // id de cliente + upsert en la sincronización ⇒ reintentos no duplican.
      const payment = await createPayment(
        {
          group_id: group.id,
          from_participant: from,
          to_participant: to,
          amount_minor_units: effectiveAmount,
          payment_date: date,
          created_by: me ?? null,
        },
        db,
      );
      router.replace(`/g/${group.id}`);
      toast({
        message: t("payment:savedToast"),
        undoLabel: t("common:undo"),
        onUndo: () => void deletePayment(payment.id, db),
        durationMs: 5_000,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <AppShell title={t("payment:title")} back={`/g/${group.id}`} showSync={false}>
      <form onSubmit={submit} noValidate className="flex flex-1 flex-col gap-4">
        {error ? <FormError messages={[error]} /> : null}

        {maxMinor != null ? (
          <div className="flex flex-col gap-2 border-2 border-border bg-surface-raised p-3">
            <p className="text-sm text-muted">
              {t("payment:pendingDebt", {
                amount: formatMoney(maxMinor, cc, BCP47[lang]),
              })}
            </p>
            <SegmentedControl
              label={t("payment:settleMode")}
              value={mode}
              onChange={(m) => {
                setMode(m);
                if (m === "partial" && amountRaw === "") {
                  setAmountRaw(minorToRawInput(maxMinor, cc));
                }
              }}
              options={[
                { value: "full", label: t("payment:settleFull") },
                { value: "partial", label: t("payment:settlePartial") },
              ]}
            />
          </div>
        ) : null}

        <SelectField
          label={t("payment:payerLabel")}
          hint={t("payment:payerHint")}
          value={from}
          onChange={(e) => {
            setTouched(true);
            setFrom(e.target.value);
          }}
        >
          <option value="" disabled>
            {t("payment:choosePerson")}
          </option>
          {options.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </SelectField>

        <SelectField
          label={t("payment:receiverLabel")}
          hint={t("payment:receiverHint")}
          error={from !== "" && from === to ? t("errors:samePerson") : null}
          value={to}
          onChange={(e) => {
            setTouched(true);
            setTo(e.target.value);
          }}
        >
          <option value="" disabled>
            {t("payment:choosePerson")}
          </option>
          {options.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </SelectField>

        {maxMinor != null && mode === "full" ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-text">
              {t("payment:amountLabel")}
            </span>
            <p className="min-h-touch border-2 border-border bg-surface px-3.5 py-3 text-base font-bold tabular-nums">
              {formatMoney(maxMinor, cc, BCP47[lang])}
            </p>
          </div>
        ) : (
          <MoneyField
            label={t("payment:amountLabel")}
            hint={t("payment:amountHint")}
            currency={cc}
            value={amountRaw}
            onChange={setAmountRaw}
            error={amountError}
          />
        )}

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
          <section className="border-2 border-border bg-surface-raised p-4 text-sm">
            <p className="font-medium text-text">
              {t("payment:resultingBalance")}
            </p>
            <div className="mt-2 flex flex-col gap-1">
              <div className="flex justify-between">
                <span className="text-muted">
                  {nameOf(allParticipants, from)} ({t("payment:before")}{" "}
                  <Money minor={preview.fromBefore} currency={cc} signed />)
                </span>
                <Money minor={preview.fromAfter} currency={cc} signed />
              </div>
              <div className="flex justify-between">
                <span className="text-muted">
                  {nameOf(allParticipants, to)} ({t("payment:before")}{" "}
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
