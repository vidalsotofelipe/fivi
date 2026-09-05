"use client";

/** Pantalla 04 — grupo listo (paso 3 de 3). Se muestra una sola vez. */
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { Button, LinkButton } from "@/components/Button";
import { Loading } from "@/components/EmptyState";
import { Card } from "@/components/ui/primitives";
import { useGroupContext } from "@/components/GroupProvider";
import { getSetting, setSetting, setupSeenKey } from "@/data/settings";
import { useHydrated } from "@/lib/useHydrated";

export default function GroupReadyPage() {
  const router = useRouter();
  const { t } = useTranslation(["group", "common"]);
  const { group, participants } = useGroupContext();
  const hydrated = useHydrated();
  const checked = useRef(false);

  useEffect(() => {
    if (checked.current) return;
    checked.current = true;
    void getSetting<boolean>(setupSeenKey(group.id)).then((seen) => {
      if (seen) {
        router.replace(`/g/${group.id}`);
      } else {
        void setSetting(setupSeenKey(group.id), true);
      }
    });
  }, [group.id, router]);

  if (!hydrated) {
    return (
      <AppShell showSync={false}>
        <Loading />
      </AppShell>
    );
  }

  return (
    <AppShell showSync={false}>
      <div className="flex flex-col items-center gap-4 pt-6 text-center">
        <span
          aria-hidden="true"
          className="flex h-16 w-16 items-center justify-center bg-accent-weak text-3xl text-accent"
        >
          ✓
        </span>
        <h2 className="text-2xl font-semibold text-text">
          {t("group:readyTitle")}
        </h2>
        <p className="text-sm text-muted">{t("group:readyBody")}</p>

        <Card className="mt-2 w-full text-left">
          <p className="font-medium text-text">{group.name}</p>
          <p className="mt-1 text-sm text-muted">
            {t("common:person", { count: participants.length })} ·{" "}
            {group.currency_code}
          </p>
        </Card>

        {/* CTAs en el flujo, justo debajo de la tarjeta: siempre visibles
            (antes iban con `mt-auto` al borde inferior y quedaban fuera de
            vista / bajo la barra del navegador en algunos teléfonos). */}
        <div className="mt-2 flex w-full flex-col gap-2">
          <LinkButton href={`/g/${group.id}/gastos/nuevo`} full>
            {t("group:addFirstExpense")}
          </LinkButton>
          <Button
            variant="secondary"
            full
            onClick={() => router.replace(`/g/${group.id}`)}
          >
            {t("group:goToSummary")}
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
