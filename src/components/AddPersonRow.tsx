"use client";

import { useTranslation } from "react-i18next";
import { Button } from "./Button";
import { TextInput } from "./fields";

/**
 * Fila "agregar persona": etiqueta arriba, y debajo el campo + el botón
 * **a la misma altura** (`items-stretch`). Antes el botón (`min-h-touch`)
 * quedaba más bajo que el input.
 */
export function AddPersonRow({
  value,
  onChange,
  onSubmit,
  busy,
  error,
  label,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  busy?: boolean;
  error?: string | null;
  label?: string;
  placeholder?: string;
}) {
  const { t } = useTranslation(["group", "common"]);
  const lbl = label ?? t("group:addPerson");

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <span className="text-sm font-medium text-text">{lbl}</span>
      <div className="mt-1.5 flex items-stretch gap-2">
        <TextInput
          className="min-w-0 flex-1"
          aria-label={lbl}
          aria-invalid={error ? true : undefined}
          placeholder={placeholder ?? t("group:personNamePlaceholder")}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <Button
          type="submit"
          variant="secondary"
          loading={busy}
          disabled={!value.trim()}
          className="shrink-0"
        >
          {t("common:add")}
        </Button>
      </div>
      {error ? (
        <span className="mt-1 block text-xs text-danger" role="alert">
          {error}
        </span>
      ) : null}
    </form>
  );
}
