"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./Button";
import { CurrencySelect } from "./CurrencySelect";
import { useToast } from "./ui/toast";
import { db } from "@/data/db";
import {
  getLastCurrency,
  setPreferredCurrency,
  usePreferredCurrency,
} from "@/data/settings";
import { detectInitialCurrency } from "@/lib/detectCurrency";

/**
 * "Moneda principal" del usuario: la que usa para ver su situación consolidada
 * (balance global estimado en el inicio). **No cambia la moneda de ningún grupo
 * ni gasto** — los importes originales siguen siendo la fuente de verdad.
 *
 * Se sugiere una automáticamente según la región (misma lógica que al crear un
 * grupo), pero el usuario siempre puede cambiarla. Preferencia por dispositivo.
 */
export function PreferredCurrencyField() {
  const { t } = useTranslation(["onboarding", "group", "common"]);
  const toast = useToast();
  const stored = usePreferredCurrency();
  const [value, setValue] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  // Sugerencia inicial por región cuando todavía no eligió.
  useEffect(() => {
    if (stored === undefined) return;
    if (typeof stored === "string") {
      setValue(stored);
      return;
    }
    let cancelled = false;
    void (async () => {
      const last = await getLastCurrency(db);
      const guess = await detectInitialCurrency(last, { timeoutMs: 1200 });
      if (!cancelled) setValue((v) => v || guess.code);
    })();
    return () => {
      cancelled = true;
    };
  }, [stored]);

  if (stored === undefined) return null;

  async function save() {
    if (!value) return;
    setBusy(true);
    try {
      await setPreferredCurrency(value, db);
      setEditing(false);
      toast({ message: t("onboarding:preferredCurrencySaved", { code: value }) });
    } finally {
      setBusy(false);
    }
  }

  if (stored && !editing) {
    return (
      <p className="flex items-center justify-between gap-2 text-xs text-muted">
        <span className="min-w-0 truncate">
          {t("onboarding:preferredCurrencyIs", { code: stored })}
        </span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex min-h-touch shrink-0 items-center px-1 font-bold uppercase tracking-caps text-accent-strong"
        >
          {t("common:edit")}
        </button>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 border-2 border-border bg-surface p-4">
      <p className="text-sm text-muted">{t("onboarding:preferredCurrencyHint")}</p>
      <CurrencySelect
        label={t("onboarding:preferredCurrencyLabel")}
        value={value}
        onChange={setValue}
      />
      <div className="flex gap-2">
        <Button type="button" variant="secondary" loading={busy} disabled={!value} onClick={save}>
          {t("common:save")}
        </Button>
        {stored ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setValue(stored);
              setEditing(false);
            }}
          >
            {t("common:cancel")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
