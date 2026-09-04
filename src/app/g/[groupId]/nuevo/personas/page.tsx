"use client";

/** Pantalla 03 — participantes durante el alta del grupo (paso 2 de 3). */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { Button, IconButton } from "@/components/Button";
import { AddPersonRow } from "@/components/AddPersonRow";
import { StepIndicator, StickyActionBar } from "@/components/ui/primitives";
import { useGroupContext } from "@/components/GroupProvider";
import { db } from "@/data/db";
import { ensureMeInGroup } from "@/data/identity";
import { useMyName } from "@/data/settings";
import {
  addParticipant,
  removeParticipant,
} from "@/data/repositories/participantRepo";

export default function SetupParticipantsPage() {
  const router = useRouter();
  const { t } = useTranslation(["group", "common", "errors", "a11y"]);
  const { group, participants } = useGroupContext();
  const myName = useMyName();

  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const seeded = useRef(false);

  // Si el usuario ya dijo cómo se llama, se suma solo al grupo que acaba de
  // crear y queda marcado como "yo": no hace falta elegirlo después.
  useEffect(() => {
    if (seeded.current || myName === undefined) return;
    seeded.current = true;
    if (myName) void ensureMeInGroup(group.id, { create: true }, db);
  }, [myName, group.id]);

  async function add() {
    const name = value.trim();
    if (!name) {
      setError(t("errors:participantNameRequired"));
      return;
    }
    if (
      participants.some((p) => p.name.toLowerCase() === name.toLowerCase())
    ) {
      setError(t("errors:duplicateParticipant"));
      return;
    }
    setBusy(true);
    try {
      await addParticipant(group.id, name, db);
      setValue("");
      setError(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title={t("group:setupStep", { current: 2, total: 3 })}
      back="/nuevo"
      showSync={false}
    >
      <StepIndicator
        steps={[t("group:wiz1"), t("group:wiz2"), t("group:wiz3")]}
        current={1}
      />

      <h2 className="text-lg font-semibold text-text">
        {t("group:participantsQuestion")}
      </h2>

      <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
        {participants.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between gap-2 px-3.5 py-2.5"
          >
            <span className="min-w-0 truncate text-text">{p.name}</span>
            <IconButton
              label={t("a11y:removePerson", { name: p.name })}
              className="text-sm text-danger"
              onClick={() => removeParticipant(p.id, db)}
            >
              <span aria-hidden="true">✕</span>
            </IconButton>
          </li>
        ))}
        {participants.length === 0 ? (
          <li className="px-3.5 py-3 text-sm text-muted">
            {t("group:noParticipantsYet")}
          </li>
        ) : null}
      </ul>

      <AddPersonRow
        value={value}
        onChange={(v) => {
          setValue(v);
          if (error) setError(null);
        }}
        onSubmit={add}
        busy={busy}
        error={error}
      />

      <StickyActionBar>
        <Button
          full
          disabled={participants.length === 0}
          onClick={() => router.replace(`/g/${group.id}/listo`)}
        >
          {t("group:continueWithPeople", { count: participants.length })}
        </Button>
      </StickyActionBar>
    </AppShell>
  );
}
