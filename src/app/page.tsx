"use client";

/** Pantalla 01 — inicio / onboarding (secciones 28 y 11). */
import Link from "next/link";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { Button, LinkButton } from "@/components/Button";
import { Loading } from "@/components/EmptyState";
import { AppMark } from "@/components/Logo";
import { Money } from "@/components/Money";
import { useLocale } from "@/components/LocaleProvider";
import { useToast } from "@/components/ui/toast";
import { db } from "@/data/db";
import { ARCHIVE_AFTER_DAYS, autoArchiveStaleGroups } from "@/data/autoArchive";
import { restoreGroup } from "@/data/repositories/groupRepo";
import { useArchivedGroups, useGroups } from "@/lib/db-hooks";
import { formatDate } from "@/lib/format";
import { useHydrated } from "@/lib/useHydrated";
import type { GroupListItem } from "@/data/queries";

function OnboardingStep({ title, body }: { title: string; body: string }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-weak text-accent"
      >
        ●
      </span>
      <span className="min-w-0">
        <span className="block font-medium text-text">{title}</span>
        <span className="block text-sm text-muted">{body}</span>
      </span>
    </li>
  );
}

function GroupRow({
  item,
  personLabel,
}: {
  item: GroupListItem;
  personLabel: string;
}) {
  return (
    <li>
      <Link
        href={`/g/${item.group.id}`}
        className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface px-4 py-4 hover:bg-text/[0.03]"
      >
        <span className="min-w-0">
          <span className="block truncate font-medium text-text">
            {item.group.name}
          </span>
          <span className="block text-xs text-muted">
            {item.group.currency_code} · {personLabel}
          </span>
        </span>
        <Money
          minor={item.total_spent_minor}
          currency={item.group.currency_code}
          className="shrink-0 font-medium"
        />
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

  // Archivado automático por inactividad: una vez por sesión, al abrir la app.
  useEffect(() => {
    if (!hydrated || archiveCheckDone.current) return;
    archiveCheckDone.current = true;
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
          <AppMark className="mt-2 h-14 w-14 rounded-[18px] shadow-sm" />
          <h2 className="mt-5 text-[26px] font-semibold leading-tight text-text">
            {t("title")}
          </h2>
          <ol className="mt-6 flex flex-col gap-4">
            <OnboardingStep title={t("step1Title")} body={t("step1Body")} />
            <OnboardingStep title={t("step2Title")} body={t("step2Body")} />
            <OnboardingStep title={t("step3Title")} body={t("step3Body")} />
          </ol>
          <div className="mt-auto pt-8">
            <LinkButton href="/nuevo" full>
              {t("createFirst")}
            </LinkButton>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={t("common:appName")}>
      <h2 className="text-sm font-medium text-muted">{t("myGroups")}</h2>
      {groups.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {groups.map((item) => (
            <GroupRow
              key={item.group.id}
              item={item}
              personLabel={t("common:person", {
                count: item.participant_count,
              })}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">{t("archive:allArchived")}</p>
      )}

      <LinkButton href="/nuevo" full variant="secondary" className="mt-2">
        {t("createGroup")}
      </LinkButton>

      {archived.length > 0 ? (
        <details className="mt-2 rounded-md border border-border bg-surface">
          <summary className="min-h-touch cursor-pointer list-none px-4 py-3 text-sm font-medium text-muted marker:hidden">
            {t("archive:sectionTitle")} ({archived.length})
          </summary>
          <ul className="flex flex-col divide-y divide-border border-t border-border">
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
