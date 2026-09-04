"use client";

import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { listCurrencies } from "@/domain/currencies";
import { currencyDisplayName } from "@/lib/currencyName";
import { SelectField } from "@/components/ui/formfields";
import { useLocale } from "./LocaleProvider";

/**
 * Selector de moneda **cerrado por defecto**: es un `<select>` nativo, así que
 * se abre sólo al tocarlo, se cierra al elegir o tocar afuera, es navegable con
 * teclado y lo maneja el lector de pantalla del sistema. No empuja el contenido.
 *
 * Muestra el código + el nombre localizado (`Intl.DisplayNames`, con el nombre
 * del catálogo como fallback). La lista es el catálogo soportado por la app.
 */
export function CurrencySelect({
  value,
  onChange,
  error,
  hint,
  disabled,
  label,
}: {
  value: string;
  onChange: (code: string) => void;
  error?: string | null;
  hint?: ReactNode;
  disabled?: boolean;
  label?: string;
}) {
  const { t } = useTranslation("group");
  const { lang } = useLocale();

  const options = useMemo(
    () =>
      listCurrencies().map((c) => ({
        code: c.code,
        label: `${c.code} — ${currencyDisplayName(c.code, lang)}`,
      })),
    [lang],
  );

  return (
    <SelectField
      label={label ?? t("currencyLabel")}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      error={error}
      hint={hint}
      disabled={disabled}
    >
      {options.map((o) => (
        <option key={o.code} value={o.code}>
          {o.label}
        </option>
      ))}
    </SelectField>
  );
}
