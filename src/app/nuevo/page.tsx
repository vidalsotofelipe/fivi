"use client";

/** Pantalla 02 — nuevo grupo (paso 1 de 3). */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { CurrencyPicker } from "@/components/CurrencyPicker";
import { TextAreaField, TextField } from "@/components/ui/TextField";
import { FormError } from "@/components/fields";
import { StepIndicator, StickyActionBar } from "@/components/ui/primitives";
import { db } from "@/data/db";
import { createGroup } from "@/data/repositories/groupRepo";
import type { CurrencyCode } from "@/domain/types";

const MAX_DESC = 120;

export default function NewGroupPage() {
  const router = useRouter();
  const { t } = useTranslation(["group", "common", "errors"]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode | "">("");
  const [busy, setBusy] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [currencyError, setCurrencyError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanName = name.trim();
    const missName = cleanName === "" ? t("errors:requiredName") : null;
    const missCur = currency === "" ? t("errors:currencyRequired") : null;
    setNameError(missName);
    setCurrencyError(missCur);
    if (missName || missCur || currency === "") return;

    setBusy(true);
    setSubmitError(null);
    try {
      const group = await createGroup(
        { name: cleanName, description, currency_code: currency },
        db,
      );
      router.replace(`/g/${group.id}/nuevo/personas`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <AppShell title={t("group:newTitle")} back="/" showSync={false}>
      <StepIndicator
        steps={[t("group:wiz1"), t("group:wiz2"), t("group:wiz3")]}
        current={0}
      />

      <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4">
        {submitError ? <FormError messages={[submitError]} /> : null}

        <TextField
          label={t("group:nameLabel")}
          placeholder={t("group:namePlaceholder")}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (nameError) setNameError(null);
          }}
          error={nameError}
          autoFocus
          required
        />

        <TextAreaField
          label={t("group:descriptionLabel")}
          placeholder={t("group:descriptionPlaceholder")}
          value={description}
          maxLength={MAX_DESC}
          onChange={(e) => setDescription(e.target.value)}
          hint={t("group:descriptionCount", { count: description.length })}
        />

        <CurrencyPicker
          value={currency}
          onChange={(c) => {
            setCurrency(c);
            if (currencyError) setCurrencyError(null);
          }}
          error={currencyError}
          hint={t("group:currencyHint")}
        />

        <StickyActionBar>
          <Button type="submit" full loading={busy}>
            {busy ? t("group:creating") : t("common:continue")}
          </Button>
        </StickyActionBar>
      </form>
    </AppShell>
  );
}
