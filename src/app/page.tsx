"use client";

/** Pantalla 01 — inicio / onboarding (secciones 28 y 11). */
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { LinkButton } from "@/components/Button";
import { Loading } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { useGroups } from "@/lib/db-hooks";
import { useHydrated } from "@/lib/useHydrated";

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

export default function HomePage() {
  const { t } = useTranslation(["onboarding", "common"]);
  const hydrated = useHydrated();
  const groups = useGroups();

  if (!hydrated || groups === undefined) {
    return (
      <AppShell title={t("common:appName")}>
        <Loading />
      </AppShell>
    );
  }

  if (groups.length === 0) {
    return (
      <AppShell title={t("common:appName")}>
        <div className="flex flex-1 flex-col">
          <h2 className="mt-4 text-[26px] font-semibold leading-tight text-text">
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
      <ul className="flex flex-col gap-2">
        {groups.map(({ group, total_spent_minor, participant_count }) => (
          <li key={group.id}>
            <Link
              href={`/g/${group.id}`}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface px-4 py-4 hover:bg-text/[0.03]"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-text">
                  {group.name}
                </span>
                <span className="block text-xs text-muted">
                  {group.currency_code} ·{" "}
                  {t("common:person", { count: participant_count })}
                </span>
              </span>
              <Money
                minor={total_spent_minor}
                currency={group.currency_code}
                className="shrink-0 font-medium"
              />
            </Link>
          </li>
        ))}
      </ul>
      <LinkButton href="/nuevo" full variant="secondary" className="mt-2">
        {t("createGroup")}
      </LinkButton>
    </AppShell>
  );
}
