"use client";

/** Pantalla 16 (detalle) — Configuración del grupo. Se llega desde "Más". */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { AddToPastExpenses } from "@/components/AddToPastExpenses";
import { Button, IconButton } from "@/components/Button";
import { CurrencyPicker } from "@/components/CurrencyPicker";
import { InvitesSection } from "@/components/InvitesSection";
import { TextAreaField, TextField } from "@/components/ui/TextField";
import { SegmentedControl } from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/overlays";
import { useToast } from "@/components/ui/toast";
import { useGroupContext } from "@/components/GroupProvider";
import { useLocale } from "@/components/LocaleProvider";
import { useTheme } from "@/components/ThemeProvider";
import { SUPPORTED_LANGS } from "@/i18n/config";
import { useGroupHasMovements } from "@/lib/db-hooks";
import { db } from "@/data/db";
import { ARCHIVE_AFTER_DAYS } from "@/data/autoArchive";
import type { Participant } from "@/domain/types";
import {
  archiveGroup,
  changeGroupCurrency,
  deleteGroup,
  renameGroup,
  restoreGroup,
} from "@/data/repositories/groupRepo";
import {
  addParticipant,
  removeParticipant,
} from "@/data/repositories/participantRepo";
import { getCurrencyInfo } from "@/domain/currencies";

const MAX_DESC = 120;

export default function GroupConfigPage() {
  const router = useRouter();
  const { t } = useTranslation([
    "settings",
    "group",
    "people",
    "archive",
    "common",
    "errors",
    "a11y",
  ]);
  const { lang, setLang } = useLocale();
  const { theme, setTheme } = useTheme();
  const { group, participants } = useGroupContext();
  const hasMovements = useGroupHasMovements(group.id);
  const toast = useToast();

  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? "");
  const [newName, setNewName] = useState("");
  const [personError, setPersonError] = useState<string | null>(null);
  const [currencyError, setCurrencyError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [pastFor, setPastFor] = useState<Participant | null>(null);

  const isArchived = group.archived_at !== null;

  const detailsDirty =
    name.trim() !== group.name ||
    description.trim() !== (group.description ?? "");

  async function saveDetails() {
    await renameGroup(group.id, { name, description }, db);
    toast({ message: t("settings:dataSaved") });
  }

  async function pickCurrency(code: string) {
    setCurrencyError(null);
    try {
      await changeGroupCurrency(group.id, code, db);
      toast({ message: t("settings:currencyUpdated") });
    } catch (err) {
      setCurrencyError(
        err instanceof Error ? err.message : t("errors:generic"),
      );
    }
  }

  async function addPerson(e: React.FormEvent) {
    e.preventDefault();
    const n = newName.trim();
    if (!n) {
      setPersonError(t("errors:participantNameRequired"));
      return;
    }
    if (participants.some((p) => p.name.toLowerCase() === n.toLowerCase())) {
      setPersonError(t("errors:duplicateParticipant"));
      return;
    }
    const created = await addParticipant(group.id, n, db);
    setNewName("");
    setPersonError(null);
    setPastFor(created);
  }

  const langOptions = SUPPORTED_LANGS.map((l) => ({
    value: l,
    label:
      l === "es"
        ? t("settings:languageSpanish")
        : t("settings:languageEnglish"),
  }));

  return (
    <AppShell title={t("settings:configTitle")} back={`/g/${group.id}/mas`}>
      {/* Datos del grupo */}
      <section className="flex flex-col gap-3">
        <h2 className="label-caps">
          {t("settings:sectionGroup")}
        </h2>
        <TextField
          label={t("settings:groupNameLabel")}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <TextAreaField
          label={t("settings:groupDescriptionLabel")}
          value={description}
          maxLength={MAX_DESC}
          onChange={(e) => setDescription(e.target.value)}
          hint={t("group:descriptionCount", { count: description.length })}
        />
        <Button
          variant="secondary"
          disabled={!detailsDirty || name.trim() === ""}
          onClick={saveDetails}
        >
          {t("settings:saveData")}
        </Button>
      </section>

      {/* Idioma — Más → Configuración → Idioma */}
      <section className="flex flex-col gap-2">
        <h2 className="label-caps">{t("settings:sectionLanguage")}</h2>
        <SegmentedControl
          label={t("settings:languageLabel")}
          options={langOptions}
          value={lang}
          onChange={setLang}
        />
        <p className="text-xs text-muted">{t("settings:languageHint")}</p>
      </section>

      {/* Apariencia — Sistema / Claro / Oscuro */}
      <section className="flex flex-col gap-2">
        <h2 className="label-caps">{t("settings:sectionAppearance")}</h2>
        <SegmentedControl
          label={t("settings:sectionAppearance")}
          options={[
            { value: "system", label: t("settings:appearanceSystem") },
            { value: "light", label: t("settings:appearanceLight") },
            { value: "dark", label: t("settings:appearanceDark") },
          ]}
          value={theme}
          onChange={setTheme}
        />
        <p className="text-xs text-muted">{t("settings:appearanceHint")}</p>
      </section>

      {/* Moneda */}
      <section className="flex flex-col gap-2">
        <h2 className="label-caps">
          {t("settings:sectionCurrency")}
        </h2>
        {hasMovements ? (
          <p className="rounded-md bg-text/[0.04] px-4 py-3 text-sm text-muted">
            {getCurrencyInfo(group.currency_code).name} ({group.currency_code}).{" "}
            {t("group:currencyLocked")}
          </p>
        ) : (
          <CurrencyPicker
            value={group.currency_code}
            onChange={pickCurrency}
            error={currencyError}
          />
        )}
      </section>

      {/* Participantes */}
      <section className="flex flex-col gap-2">
        <h2 className="label-caps">
          {t("settings:sectionParticipants")} ({participants.length})
        </h2>
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {participants.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-2 px-3.5 py-2"
            >
              <span className="min-w-0 truncate text-[15px] text-text">
                {p.name}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPastFor(p)}
                  className="min-h-touch rounded-sm px-2 text-xs text-muted hover:text-text"
                >
                  {t("people:pastOpen")}
                </button>
                <IconButton
                  label={t("a11y:removePerson", { name: p.name })}
                  className="h-9 w-9 text-danger"
                  onClick={() => removeParticipant(p.id, db)}
                >
                  <span aria-hidden="true">✕</span>
                </IconButton>
              </span>
            </li>
          ))}
          {participants.length === 0 ? (
            <li className="px-3.5 py-3 text-sm text-muted">
              {t("people:emptyBody")}
            </li>
          ) : null}
        </ul>

        {pastFor ? (
          <AddToPastExpenses
            groupId={group.id}
            participant={pastFor}
            currency={group.currency_code}
            onDone={() => setPastFor(null)}
          />
        ) : null}

        <form onSubmit={addPerson} className="flex items-end gap-2">
          <div className="flex-1">
            <TextField
              label={t("people:addPerson")}
              placeholder={t("group:personNamePlaceholder")}
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                if (personError) setPersonError(null);
              }}
              error={personError}
            />
          </div>
          <Button type="submit" variant="secondary" disabled={!newName.trim()}>
            {t("common:add")}
          </Button>
        </form>
      </section>

      <InvitesSection groupId={group.id} />

      {/* Archivar / restaurar (reversible) */}
      <section className="mt-2 flex flex-col gap-1.5 border-t border-border pt-4">
        <h2 className="label-caps">
          {t("archive:sectionTitle")}
        </h2>
        <p className="text-xs text-muted">
          {isArchived
            ? t("archive:isArchivedHint")
            : t("archive:archiveHint", { days: ARCHIVE_AFTER_DAYS })}
        </p>
        {isArchived ? (
          <Button
            variant="secondary"
            className="self-start"
            loading={archiving}
            onClick={async () => {
              setArchiving(true);
              await restoreGroup(group.id, db);
              toast({ message: t("archive:restoredToast", { name: group.name }) });
              setArchiving(false);
            }}
          >
            {t("archive:restore")}
          </Button>
        ) : (
          <Button
            variant="secondary"
            className="self-start"
            onClick={() => setConfirmArchive(true)}
          >
            {t("archive:archiveGroup")}
          </Button>
        )}
      </section>

      {/* Zona sensible */}
      <section className="mt-2 flex flex-col gap-2 border-t border-border pt-4">
        <h2 className="label-caps text-danger">
          {t("settings:sectionDanger")}
        </h2>
        <Button
          variant="ghost"
          className="self-start text-danger"
          onClick={() => setConfirmDelete(true)}
        >
          {t("settings:deleteGroup")}
        </Button>
      </section>

      <ConfirmDialog
        open={confirmArchive}
        onCancel={() => setConfirmArchive(false)}
        onConfirm={async () => {
          setArchiving(true);
          await archiveGroup(group.id, db);
          toast({ message: t("archive:archivedToast", { name: group.name }) });
          router.replace("/");
        }}
        title={t("archive:archiveConfirmTitle", { name: group.name })}
        body={t("archive:archiveConfirmBody")}
        confirmLabel={t("archive:archiveGroup")}
        cancelLabel={t("common:cancel")}
        danger={false}
        busy={archiving}
      />

      <ConfirmDialog
        open={confirmDelete}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setDeleting(true);
          await deleteGroup(group.id, db);
          router.replace("/");
        }}
        title={t("settings:deleteGroupConfirmTitle", { name: group.name })}
        body={t("settings:deleteGroupConfirmBody")}
        confirmLabel={t("settings:deleteGroup")}
        cancelLabel={t("common:cancel")}
        busy={deleting}
      />
    </AppShell>
  );
}
