"use client";

/** Pantalla 16 — menú "Más". La configuración detallada vive en /config. */
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { AppVersion } from "@/components/AppVersion";
import { BottomNav } from "@/components/BottomNav";
import { CafecitoSupport } from "@/components/CafecitoSupport";
import { MePicker } from "@/components/MePicker";
import { ShareButton } from "@/components/ShareButton";
import { useGroupContext } from "@/components/GroupProvider";
import { nameOf } from "@/components/ui/cards";
import { useMe } from "@/data/settings";
import { useHydrated } from "@/lib/useHydrated";

export default function MorePage() {
  const { t } = useTranslation(["settings", "activity", "group", "common"]);
  const { group, participants } = useGroupContext();
  const hydrated = useHydrated();
  const me = useMe(group.id);
  const [pickMe, setPickMe] = useState(false);

  const base = `/g/${group.id}`;
  const bottomNav = <BottomNav groupId={group.id} />;

  return (
    <AppShell title={t("settings:title")} back={base} bottomNav={bottomNav}>
      <nav className="flex flex-col gap-2" aria-label={t("settings:menuTitle")}>
        <MenuLink href={`${base}/actividad`} label={t("activity:title")} />
        <MenuLink
          href={`${base}/config`}
          label={t("settings:configTitle")}
        />
      </nav>

      <section className="flex flex-col gap-2">
        <h2 className="label-caps">{t("settings:whoAreYouLabel")}</h2>
        <div className="flex items-center justify-between border-2 border-border bg-surface px-4 py-3">
          <span className="text-[15px] text-text">
            {hydrated && me
              ? nameOf(participants, me)
              : t("group:notSet")}
          </span>
          <button
            type="button"
            onClick={() => setPickMe(true)}
            disabled={participants.length === 0}
            className="min-h-touch text-sm font-bold text-accent disabled:opacity-40"
          >
            {t("settings:whoAreYouChange")}
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="label-caps">{t("settings:sectionShare")}</h2>
        <ShareButton groupId={group.id} groupName={group.name} />
      </section>

      <section className="flex flex-col gap-1">
        <h2 className="label-caps">{t("settings:sectionHelp")}</h2>
        <p className="text-sm text-muted">{t("settings:helpBody")}</p>
      </section>

      <CafecitoSupport />

      <AppVersion />

      <MePicker
        open={pickMe}
        onClose={() => setPickMe(false)}
        groupId={group.id}
        currency={group.currency_code}
        participants={participants}
        currentId={me ?? null}
      />
    </AppShell>
  );
}

function MenuLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-touch items-center justify-between border-2 border-border bg-surface px-4 py-3 text-[15px] font-medium text-text hover:bg-accent-weak"
    >
      {label}
      <span aria-hidden="true" className="text-warm">
        →
      </span>
    </Link>
  );
}
