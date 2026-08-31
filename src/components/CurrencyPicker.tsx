"use client";

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { listCurrencies } from "@/domain/currencies";
import type { CurrencyCode } from "@/domain/types";
import { BCP47 } from "@/i18n/config";
import { useLocale } from "./LocaleProvider";
import { Combobox } from "./ui/Combobox";

/**
 * Selector de moneda: código + nombre localizado (`Intl.DisplayNames`), con el
 * nombre del catálogo como fallback. La moneda del grupo es un dato del negocio,
 * no cambia con el idioma; sólo se muestra su nombre traducido.
 */
export function CurrencyPicker({
  value,
  onChange,
  error,
  hint,
  disabled,
}: {
  value: CurrencyCode | "";
  onChange: (code: CurrencyCode) => void;
  error?: string | null;
  hint?: React.ReactNode;
  disabled?: boolean;
}) {
  const { t } = useTranslation("group");
  const { lang } = useLocale();

  const options = useMemo(() => {
    let display: Intl.DisplayNames | null = null;
    try {
      display = new Intl.DisplayNames([BCP47[lang]], { type: "currency" });
    } catch {
      display = null;
    }
    return listCurrencies().map((c) => {
      const localized = display?.of(c.code);
      const label =
        localized && localized.toUpperCase() !== c.code ? localized : c.name;
      return {
        value: c.code,
        label,
        meta: c.code,
        keywords: `${c.name} ${c.code}`,
      };
    });
  }, [lang]);

  return (
    <Combobox
      label={t("currencyLabel")}
      options={options}
      value={value}
      onChange={onChange}
      error={error}
      hint={hint}
      disabled={disabled}
      placeholder={t("currencyLabel")}
    />
  );
}
