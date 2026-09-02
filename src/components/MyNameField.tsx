"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./Button";
import { TextField } from "./ui/TextField";
import { useToast } from "./ui/toast";
import { db } from "@/data/db";
import { autoLinkMe } from "@/data/identity";
import { setMyName, useMyName } from "@/data/settings";

/**
 * "¿Cómo te llamás?" — una sola vez, para todos los grupos.
 *
 * Con el nombre puesto, FIVI se suma solo a los grupos que el usuario crea y lo
 * reconoce en los que ya existen (invitaciones, otro dispositivo) cuando hay un
 * participante con ese nombre. Evita tener que elegir "quién sos" grupo por grupo.
 *
 * Sigue siendo local al dispositivo: los participantes son nombres, no cuentas.
 */
export function MyNameField({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation(["onboarding", "common"]);
  const toast = useToast();
  const stored = useMyName();
  const [value, setValue] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof stored === "string") setValue(stored);
  }, [stored]);

  if (stored === undefined) return null; // cargando

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const clean = value.trim();
    if (!clean) return;
    setBusy(true);
    try {
      await setMyName(clean, db);
      const linked = await autoLinkMe(db);
      setEditing(false);
      toast({
        message:
          linked.length > 0
            ? t("onboarding:myNameLinked", { count: linked.length })
            : t("onboarding:myNameSaved", { name: clean }),
      });
    } finally {
      setBusy(false);
    }
  }

  // Ya tiene nombre y no está editando: una línea discreta.
  if (stored && !editing) {
    return (
      <p className="flex items-center justify-between gap-2 text-xs text-muted">
        <span className="min-w-0 truncate">
          {t("onboarding:myNameIs", { name: stored })}
        </span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="shrink-0 font-bold uppercase tracking-caps text-accent-strong"
        >
          {t("common:edit")}
        </button>
      </p>
    );
  }

  return (
    <form
      onSubmit={save}
      noValidate
      className={compact ? "flex flex-col gap-2" : "flex flex-col gap-2 border-2 border-border bg-surface p-4"}
    >
      {!compact ? (
        <p className="text-sm text-muted">{t("onboarding:myNameHint")}</p>
      ) : null}
      <TextField
        label={t("onboarding:myNameLabel")}
        placeholder={t("onboarding:myNamePlaceholder")}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoComplete="given-name"
      />
      <div className="flex gap-2">
        <Button type="submit" variant="secondary" loading={busy} disabled={!value.trim()}>
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
    </form>
  );
}
