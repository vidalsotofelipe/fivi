"use client";

import { useParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { LinkButton } from "@/components/Button";
import { EmptyState, Loading } from "@/components/EmptyState";
import { GroupContextProvider } from "@/components/GroupProvider";
import { useSyncActions, useSyncState } from "@/components/SyncProvider";
import { isUuid } from "@/data/ids";
import { useGroup, useParticipants } from "@/lib/db-hooks";
import { useHydrated } from "@/lib/useHydrated";

/**
 * Carga el grupo y sus participantes una vez para todas las pantallas de
 * `/g/[groupId]`. Si el grupo no está localmente (se abrió por enlace), lo pide
 * al servidor y espera el primer pull antes de darlo por perdido.
 */
export default function GroupLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation(["group", "common"]);
  const { groupId } = useParams<{ groupId: string }>();
  // Un id mal formado (`/g/grupo-inexistente`) no debe consultar la base ni
  // pedirse al servidor: iría a Postgres como uuid inválido y quedaría
  // reintentando. Se corta acá y se muestra la pantalla amigable.
  const validId = isUuid(groupId);
  const hydrated = useHydrated();
  const group = useGroup(validId ? groupId : "");
  const participants = useParticipants(validId ? groupId : "");
  const { requestGroup } = useSyncActions();
  const { hydrating_group_ids } = useSyncState();

  useEffect(() => {
    if (validId) requestGroup(groupId);
  }, [groupId, validId, requestGroup]);

  if (!validId) {
    return (
      <AppShell title={t("group:notFoundTitle")} back="/">
        <EmptyState
          title={t("group:notFoundTitle")}
          description={t("group:notFoundBody")}
          action={<LinkButton href="/">{t("group:backHome")}</LinkButton>}
        />
      </AppShell>
    );
  }

  if (!hydrated || group === undefined || participants === undefined) {
    return (
      <AppShell title={t("common:appName")} back="/">
        <Loading />
      </AppShell>
    );
  }

  if (group === null && hydrating_group_ids.includes(groupId)) {
    return (
      <AppShell title={t("common:appName")} back="/">
        <Loading />
      </AppShell>
    );
  }

  if (group === null) {
    return (
      <AppShell title={t("group:notFoundTitle")} back="/">
        <EmptyState
          title={t("group:notFoundTitle")}
          description={t("group:notFoundBody")}
          action={<LinkButton href="/">{t("group:backHome")}</LinkButton>}
        />
      </AppShell>
    );
  }

  return (
    <GroupContextProvider value={{ group, participants }}>
      {children}
    </GroupContextProvider>
  );
}
