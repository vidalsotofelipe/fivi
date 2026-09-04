"use client";

/** Pantalla 02 — nuevo grupo (paso 1 de 3). */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { CurrencySelect } from "@/components/CurrencySelect";
import { TextAreaField, TextField } from "@/components/ui/TextField";
import { FormError } from "@/components/fields";
import { StepIndicator, StickyActionBar } from "@/components/ui/primitives";
import { db } from "@/data/db";
import { createGroup } from "@/data/repositories/groupRepo";
import { getLastCurrency, rememberLastCurrency } from "@/data/settings";
import {
  detectInitialCurrency,
  localeRegionCurrency,
  type CurrencySource,
} from "@/lib/detectCurrency";
import { DEFAULT_CURRENCY } from "@/domain/countryCurrency";
import { GROUP_DESCRIPTION_MAX, GROUP_NAME_MAX } from "@/domain/limits";

const GROUP_NAME_FIELD = "group-name";

export default function NewGroupPage() {
  const router = useRouter();
  const { t } = useTranslation(["group", "common", "errors"]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  // Arranca con una estimación síncrona (nunca vacío, nunca bloquea) y se
  // refina con la detección por IP en un efecto.
  const [currency, setCurrency] = useState<string>(
    () => localeRegionCurrency() ?? DEFAULT_CURRENCY,
  );
  const [detection, setDetection] = useState<CurrencySource | null>(null);
  const currencyTouched = useRef(false);
  const [busy, setBusy] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getLastCurrency(db)
      .then((last) => detectInitialCurrency(last))
      .then((d) => {
        if (cancelled || currencyTouched.current) return;
        setCurrency(d.code);
        setDetection(d.source);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function onPickCurrency(code: string) {
    currencyTouched.current = true;
    setCurrency(code);
    setDetection(null); // el usuario decidió: ocultamos el aviso
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanName = name.trim();
    if (cleanName === "") {
      setNameError(t("errors:groupNameRequired"));
      // Marcar `aria-invalid` no alcanza: hay que llevar el foco al campo, o con
      // el teclado (y con lector de pantalla) el error queda arriba y sin
      // contexto. `focus()` también hace scroll hasta él.
      document.getElementById(GROUP_NAME_FIELD)?.focus();
      return;
    }
    if (cleanName.length > GROUP_NAME_MAX) {
      setNameError(t("errors:groupNameTooLong", { max: GROUP_NAME_MAX }));
      document.getElementById(GROUP_NAME_FIELD)?.focus();
      return;
    }

    setBusy(true);
    setSubmitError(null);
    try {
      const group = await createGroup(
        { name: cleanName, description, currency_code: currency },
        db,
      );
      void rememberLastCurrency(currency, db);
      router.replace(`/g/${group.id}/nuevo/personas`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  const currencyHint =
    detection === "geo" || detection === "locale"
      ? t("group:currencyDetectedHint", { code: currency })
      : detection === "country-unsupported"
        ? t("group:currencyUnsupportedHint")
        : detection === "default"
          ? t("group:currencyDefaultHint")
          : detection === "last"
            ? t("group:currencyLastHint", { code: currency })
            : undefined;

  return (
    <AppShell title={t("group:newTitle")} back="/" showSync={false}>
      <StepIndicator
        steps={[t("group:wiz1"), t("group:wiz2"), t("group:wiz3")]}
        current={0}
      />

      <form onSubmit={handleSubmit} noValidate className="flex flex-1 flex-col gap-4">
        {submitError ? <FormError messages={[submitError]} /> : null}

        <TextField
          id={GROUP_NAME_FIELD}
          label={t("group:nameLabel")}
          placeholder={t("group:namePlaceholder")}
          value={name}
          maxLength={GROUP_NAME_MAX}
          onChange={(e) => {
            setName(e.target.value);
            if (nameError) setNameError(null);
          }}
          error={nameError}
          hint={t("group:nameCount", {
            count: name.length,
            max: GROUP_NAME_MAX,
          })}
        />

        <TextAreaField
          label={t("group:descriptionLabel")}
          placeholder={t("group:descriptionPlaceholder")}
          value={description}
          maxLength={GROUP_DESCRIPTION_MAX}
          onChange={(e) => setDescription(e.target.value)}
          hint={t("group:descriptionCount", { count: description.length })}
        />

        <CurrencySelect value={currency} onChange={onPickCurrency} hint={currencyHint} />

        <StickyActionBar>
          <Button type="submit" full loading={busy}>
            {busy ? t("group:creating") : t("common:continue")}
          </Button>
        </StickyActionBar>
      </form>
    </AppShell>
  );
}
