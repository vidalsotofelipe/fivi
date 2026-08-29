"use client";

/** Configuración del grupo (secciones 3 y 30). */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { CurrencySelect } from "@/components/CurrencySelect";
import { Field, TextArea, TextInput } from "@/components/fields";
import { useGroupContext } from "@/components/GroupProvider";
import { useGroupHasMovements } from "@/lib/db-hooks";
import { db } from "@/data/db";
import {
  changeGroupCurrency,
  deleteGroup,
  renameGroup,
} from "@/data/repositories/groupRepo";
import {
  addParticipant,
  removeParticipant,
} from "@/data/repositories/participantRepo";
import { getCurrencyInfo } from "@/domain/currencies";

export default function GroupConfigPage() {
  const router = useRouter();
  const { group, participants } = useGroupContext();
  const hasMovements = useGroupHasMovements(group.id);

  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? "");
  const [newName, setNewName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const detailsDirty =
    name.trim() !== group.name ||
    description.trim() !== (group.description ?? "");

  async function saveDetails() {
    await renameGroup(group.id, { name, description }, db);
    setMsg("Datos guardados");
  }

  async function pickCurrency(code: string) {
    setMsg(null);
    try {
      await changeGroupCurrency(group.id, code, db);
      setMsg("Moneda actualizada");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    }
  }

  async function add() {
    const n = newName.trim();
    if (!n) return;
    await addParticipant(group.id, n, db);
    setNewName("");
  }

  return (
    <AppShell title="Configuración" back={`/g/${group.id}`}>
      <section className="flex flex-col gap-4">
        <Field label="Nombre del grupo">
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Descripción" hint="Opcional">
          <TextArea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Button
          variant="secondary"
          disabled={!detailsDirty || name.trim() === ""}
          onClick={saveDetails}
        >
          Guardar datos
        </Button>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium opacity-60">Moneda</h2>
        {hasMovements ? (
          <p className="rounded-xl bg-black/5 px-4 py-3 text-sm dark:bg-white/5">
            {group.currency_code} — {getCurrencyInfo(group.currency_code).name}.
            La moneda no puede modificarse porque este grupo ya tiene
            movimientos registrados.
          </p>
        ) : (
          <CurrencySelect
            value={group.currency_code}
            onChange={pickCurrency}
          />
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium opacity-60">
          Participantes ({participants.length})
        </h2>
        <ul className="divide-y divide-black/5 dark:divide-white/10">
          {participants.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-2 py-2.5"
            >
              <span className="truncate text-[15px]">{p.name}</span>
              <button
                onClick={() => removeParticipant(p.id, db)}
                className="rounded-lg px-2 py-1 text-xs text-red-600 hover:bg-red-500/10"
              >
                Quitar
              </button>
            </li>
          ))}
          {participants.length === 0 ? (
            <li className="py-2.5 text-sm opacity-50">
              Todavía no hay participantes.
            </li>
          ) : null}
        </ul>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
          className="flex gap-2"
        >
          <TextInput
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nombre"
          />
          <Button type="submit" variant="secondary" disabled={!newName.trim()}>
            Agregar
          </Button>
        </form>
      </section>

      {msg ? <p className="text-sm opacity-70">{msg}</p> : null}

      <section className="mt-2 flex flex-col gap-2 border-t border-black/10 pt-4 dark:border-white/10">
        {confirmDelete ? (
          <div className="flex flex-col gap-2 rounded-xl border border-red-500/30 p-3">
            <p className="text-sm">
              Se eliminará el grupo de este dispositivo. ¿Continuar?
            </p>
            <div className="flex gap-2">
              <Button
                variant="danger"
                full
                onClick={async () => {
                  await deleteGroup(group.id, db);
                  router.replace("/");
                }}
              >
                Eliminar grupo
              </Button>
              <Button
                variant="ghost"
                full
                onClick={() => setConfirmDelete(false)}
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="ghost"
            className="text-red-600"
            onClick={() => setConfirmDelete(true)}
          >
            Eliminar grupo
          </Button>
        )}
      </section>
    </AppShell>
  );
}
