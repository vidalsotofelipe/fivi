"use client";

/** Pantalla 01 — inicio / onboarding (secciones 28 y 11). */
import Link from "next/link";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { Button, LinkButton } from "@/components/Button";
import { Loading } from "@/components/EmptyState";
import { JoinInviteDisclosure } from "@/components/JoinInviteDisclosure";
import { AppMark } from "@/components/Logo";
import { Money } from "@/components/Money";
import { GroupsSummaryHeader } from "@/components/GroupsSummaryHeader";
import { useLocale } from "@/components/LocaleProvider";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { db } from "@/data/db";
import { ARCHIVE_AFTER_DAYS, autoArchiveStaleGroups } from "@/data/autoArchive";
import { restoreGroup } from "@/data/repositories/groupRepo";
import { autoLinkMe } from "@/data/identity";
import { MyNameField } from "@/components/MyNameField";
import { groupInitials, summarizeGroups } from "@/domain/groupsSummary";
import { useArchivedGroups, useGroups } from "@/lib/db-hooks";
import { formatDate, formatRelative } from "@/lib/format";
import { useHydrated } from "@/lib/useHydrated";
import type { GroupListItem } from "@/data/queries";

function OnboardingStep({
  index,
  title,
  body,
}: {
  index: number;
  title: string;
  body: string;
}) {
  return (
    <li className="flex gap-3 py-4">
      <span
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-[11px] font-bold uppercase tracking-caps text-warm-strong"
      >
        {String(index).padStart(2, "0")}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold text-text">{title}</span>
        <span className="block text-sm text-muted">{body}</span>
      </span>
    </li>
  );
}

/** Colores del avatar, estables por grupo (derivados del id, no aleatorios). */
const AVATAR_TONES = [
  "bg-accent-weak text-accent-strong",
  "bg-warm-weak text-warm-strong",
  "bg-surface-raised text-text",
] as const;

function avatarTone(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length]!;
}

function GroupRow({ item }: { item: GroupListItem }) {
  const { t } = useTranslation(["onboarding", "group", "common"]);
  const { lang } = useLocale();
  const cc = item.group.currency_code;
  const bal = item.my_balance_minor;

  // Subtítulo: personas · gastos · pendientes de sincronizar (si los hay).
  const meta = [
    t("common:person", { count: item.participant_count }),
    t("onboarding:expenseCount", { count: item.expense_count }),
    item.pending_sync_count > 0
      ? t("sync:unsynced", { count: item.pending_sync_count })
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li>
      <Link
        href={`/g/${item.group.id}`}
        className="flex items-center gap-3 border-2 border-border bg-surface px-3 py-3 hover:border-accent hover:bg-accent-weak"
      >
        <span
          aria-hidden="true"
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center text-[13px] font-bold tracking-caps",
            avatarTone(item.group.id),
          )}
        >
          {groupInitials(item.group.name)}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-text">
            {item.group.name}
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted">
            {meta}
          </span>
          {item.last_activity_at ? (
            <span className="mt-0.5 block text-xs text-faint">
              {formatRelative(item.last_activity_at, lang)}
            </span>
          ) : null}
        </span>

        <span className="shrink-0 text-right">
          {bal == null ? (
            <span className="block max-w-[7.5rem] text-xs font-semibold text-accent-strong">
              {t("onboarding:whoAreYouCta")}
            </span>
          ) : bal === 0 ? (
            <>
              <span className="block font-semibold text-positive">
                <Money minor={item.total_spent_minor} currency={cc} />
              </span>
              <span className="block label-caps">{t("group:settledUp")}</span>
            </>
          ) : (
            <>
              <span
                className={cn(
                  "block font-semibold",
                  bal > 0 ? "text-positive" : "text-warm-strong",
                )}
              >
                <Money minor={Math.abs(bal)} currency={cc} />
              </span>
              <span className="block label-caps">
                {bal > 0 ? t("group:youAreOwed") : t("group:youOwe")}
              </span>
            </>
          )}
        </span>
      </Link>
    </li>
  );
}

export default function HomePage() {
  const { t } = useTranslation(["onboarding", "archive", "common"]);
  const { lang } = useLocale();
  const toast = useToast();
  const hydrated = useHydrated();
  const groups = useGroups();
  const archived = useArchivedGroups();
  const archiveCheckDone = useRef(false);

  // Archivado automático + reconocerse en los grupos donde ya hay un
  // participante con el nombre del usuario. Una vez por sesión, al abrir la app.
  useEffect(() => {
    if (!hydrated || archiveCheckDone.current) return;
    archiveCheckDone.current = true;
    void autoLinkMe(db);
    void autoArchiveStaleGroups(db).then((ids) => {
      if (ids.length > 0) {
        toast({
          message: t("archive:autoToast", {
            count: ids.length,
            days: ARCHIVE_AFTER_DAYS,
          }),
        });
      }
    });
  }, [hydrated, toast, t]);

  if (!hydrated || groups === undefined || archived === undefined) {
    return (
      <AppShell title={t("common:appName")}>
        <Loading />
      </AppShell>
    );
  }

  if (groups.length === 0 && archived.length === 0) {
    return (
      <AppShell title={t("common:appName")}>
        <div className="flex flex-1 flex-col">
          <AppMark className="mt-2 h-14 w-14" />
          <h1 className="font-display mt-5 text-[32px] font-bold leading-[1.1] tracking-tightest text-text">
            {t("title")}
          </h1>
          <p className="mt-2 text-[15px] text-muted">{t("subtitle")}</p>

          <ol className="mt-6 flex flex-col divide-y divide-border border-y-2 border-border">
            <OnboardingStep index={1} title={t("step1Title")} body={t("step1Body")} />
            <OnboardingStep index={2} title={t("step2Title")} body={t("step2Body")} />
            <OnboardingStep index={3} title={t("step3Title")} body={t("step3Body")} />
          </ol>

          <div className="mt-auto flex flex-col gap-3 pt-8">
            {/* El nombre se pide una vez y sirve para todos los grupos. */}
            <MyNameField />
            <LinkButton href="/nuevo" full>
              {t("createFirst")}
            </LinkButton>
            <JoinInviteDisclosure />
          </div>
        </div>
      </AppShell>
    );
  }

  const summary = summarizeGroups(
    groups.map((g) => ({
      currency_code: g.group.currency_code,
      my_balance_minor: g.my_balance_minor,
    })),
  );

  return (
    <AppShell title={t("common:appName")}>
      <GroupsSummaryHeader summary={summary} />

      <h2 className="label-caps">{t("myGroups")}</h2>
      {groups.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {groups.map((item) => (
            <GroupRow key={item.group.id} item={item} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">{t("archive:allArchived")}</p>
      )}

      <LinkButton href="/nuevo" full variant="secondary" className="mt-2">
        {t("createGroup")}
      </LinkButton>
      <JoinInviteDisclosure />
      <MyNameField />

      {archived.length > 0 ? (
        <details className="mt-4 border-t-2 border-border-strong pt-3">
          <summary className="label-caps flex min-h-touch cursor-pointer list-none items-center gap-2 marker:hidden">
            {t("archive:sectionTitle")} ({archived.length})
          </summary>
          <ul className="mt-2 flex flex-col divide-y divide-border border-2 border-border">
            {archived.map((item) => (
              <li
                key={item.group.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <Link href={`/g/${item.group.id}`} className="min-w-0">
                  <span className="block truncate text-[15px] text-text">
                    {item.group.name}
                  </span>
                  <span className="block text-xs text-muted">
                    {item.group.archived_at
                      ? t("archive:archivedOn", {
                          date: formatDate(item.group.archived_at, lang),
                        })
                      : null}
                  </span>
                </Link>
                <Button
                  variant="ghost"
                  className="shrink-0 px-2 text-sm text-accent"
                  onClick={async () => {
                    await restoreGroup(item.group.id, db);
                    toast({
                      message: t("archive:restoredToast", {
                        name: item.group.name,
                      }),
                    });
                  }}
                >
                  {t("archive:restore")}
                </Button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </AppShell>
  );
}
