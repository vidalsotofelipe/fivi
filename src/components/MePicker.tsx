"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CurrencyCode, Participant } from "@/domain/types";
import { db } from "@/data/db";
import { addParticipant } from "@/data/repositories/participantRepo";
import { getMyName, setMe, setMyName } from "@/data/settings";
import { Button } from "./Button";
import { TextField } from "./ui/TextField";
import { BottomSheet } from "./ui/overlays";
import { AddToPastExpenses } from "./AddToPastExpenses";
import { cn } from "@/lib/cn";

/**
 * Elegir "quién sos vos" en un grupo (no hay identidad real: son nombres).
 * La preferencia es por dispositivo (`settings`), no se sincroniza.
 *
 * Si el usuario no está en la lista (típico al entrar por invitación), puede
 * **sumarse como participante** desde acá mismo, sin ir a Personas. Al crearse,
 * antes de cerrar, se pregunta en qué gastos anteriores corresponde sumarlo
 * (reusa `AddToPastExpenses`, el mismo paso que ya existe en Personas) — así
 * alguien que entra por invitación y arranca de cero no queda afuera de los
 * gastos ya registrados sin que nadie se lo haya preguntado.
 *
 * Elegir un nombre que YA está en la lista sigue cerrando de inmediato: ese
 * participante no es nuevo, no hay nada que ofrecerle.
 */
export function MePicker({
  open,
  onClose,
  groupId,
  currency,
  participants,
  currentId,
}: {
  open: boolean;
  onClose: () => void;
  groupId: string;
  currency: CurrencyCode;
  participants: Participant[];
  currentId: string | null;
}) {
  const { t } = useTranslation(["group", "common", "onboarding", "people"]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  /** Participante recién creado desde acá: dispara el paso de gastos anteriores. */
  const [createdParticipant, setCreatedParticipant] = useState<Participant | null>(
    null,
  );

  // Prefill con el nombre global del usuario, si lo tiene. Cada apertura
  // arranca sin el paso de "gastos anteriores" (por si quedó de una vez previa).
  useEffect(() => {
    if (!open) return;
    setCreatedParticipant(null);
    void getMyName(db).then((n) => {
      if (n) setName((v) => v || n);
    });
  }, [open]);

  async function addMe(e: React.FormEvent) {
    e.preventDefault();
    const clean = name.trim();
    if (!clean || busy) return;
    setBusy(true);
    try {
      const created = await addParticipant(groupId, clean, db);
      await setMe(groupId, created.id);
      // Deja el nombre como preferencia global si todavía no había uno, así los
      // próximos grupos lo reconocen solo.
      const existing = await getMyName(db);
      if (!existing) await setMyName(clean, db);
      // No cierra todavía: `AddToPastExpenses` decide sola si hay algo que
      // preguntar (con `explicit={false}` se cierra sin molestar si no hay
      // gastos donde sumarlo).
      setCreatedParticipant(created);
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={t("group:whoAreYou")}>
      {createdParticipant ? (
        <AddToPastExpenses
          groupId={groupId}
          participant={createdParticipant}
          currency={currency}
          onDone={onClose}
        />
      ) : (
        <>
          <p className="text-sm text-muted">{t("group:whoAreYouHint")}</p>

          {participants.length > 0 ? (
            <ul className="mt-3 flex flex-col divide-y divide-border rounded-md border border-border">
              {participants.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={async () => {
                      await setMe(groupId, p.id);
                      onClose();
                    }}
                    className={cn(
                      "flex min-h-touch w-full items-center justify-between px-4 py-2.5 text-left text-[15px] hover:bg-accent-weak",
                      currentId === p.id && "bg-accent-weak",
                    )}
                  >
                    <span className="truncate text-text">{p.name}</span>
                    {currentId === p.id ? (
                      <span aria-hidden="true" className="text-accent">
                        ✓
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <form onSubmit={addMe} noValidate className="mt-4 flex flex-col gap-2">
            <p className="text-sm font-medium text-text">
              {t("group:notInListTitle")}
            </p>
            <TextField
              label={t("onboarding:myNameLabel")}
              placeholder={t("onboarding:myNamePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="given-name"
            />
            <Button type="submit" loading={busy} disabled={!name.trim()}>
              {t("group:addMeToGroup")}
            </Button>
          </form>
        </>
      )}
    </BottomSheet>
  );
}
