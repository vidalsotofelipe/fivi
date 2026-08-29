"use client";

/** Crear grupo (secciones 1, 2, 29). La moneda es obligatoria. */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { CurrencySelect } from "@/components/CurrencySelect";
import { Field, TextArea, TextInput } from "@/components/fields";
import { db } from "@/data/db";
import { createGroup } from "@/data/repositories/groupRepo";
import type { CurrencyCode } from "@/domain/types";

export default function NewGroupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim() !== "" && currency !== "" && !busy;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || currency === "") return;
    setBusy(true);
    setError(null);
    try {
      const group = await createGroup(
        { name: name.trim(), description, currency_code: currency },
        db,
      );
      router.replace(`/g/${group.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <AppShell title="Nuevo grupo" back="/">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Nombre del grupo">
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Viaje a Bariloche"
            autoFocus
          />
        </Field>

        <Field label="Descripción" hint="Opcional">
          <TextArea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Fin de semana largo con amigos"
          />
        </Field>

        <Field
          label="Moneda"
          hint="No se puede cambiar una vez que el grupo tiene gastos o pagos."
        >
          <CurrencySelect value={currency} onChange={setCurrency} />
        </Field>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <Button type="submit" full disabled={!canSubmit}>
          {busy ? "Creando…" : "Crear grupo"}
        </Button>
      </form>
    </AppShell>
  );
}
