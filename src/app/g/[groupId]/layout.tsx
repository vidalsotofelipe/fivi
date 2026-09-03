"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { LinkButton } from "@/components/Button";
import { EmptyState, Loading } from "@/components/EmptyState";
import { GroupContextProvider } from "@/components/GroupProvider";
import { useSyncActions, useSyncState } from "@/components/SyncProvider";
import { isUuid } from "@/data/ids";
import { useGroup, useParticipants } from "@/lib/db-hooks";
import { useHydrated } from "@/lib/useHydrated";

/** Tope de espera para el primer pull de un grupo pedido por enlace. */
const HYDRATE_TIMEOUT_MS = 8000;

/**
 * Carga el grupo y sus participantes una vez para todas las pantallas de
 * `/g/[groupId]`. Si el grupo no está localmente (se abrió por enlace), lo pide
 * al servidor y espera el primer pull antes de darlo por perdido.
 *
 * Un grupo que YA está en este dispositivo se muestra siempre, con o sin
 * conexión. El estado "cargando" del pull tiene tope (`HYDRATE_TIMEOUT_MS`) y se
 * corta de inmediato si no hay conexión: así `/g/<id>` de un grupo que no está
 * localmente nunca queda girando para siempre.
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
  const { hydrating_group_ids, online } = useSyncState();

  const [hydrateTimedOut, setHydrateTimedOut] = useState(false);

  useEffect(() => {
    if (validId) requestGroup(groupId);
  }, [groupId, validId, requestGroup]);

  // Tope de la espera: si el grupo no llegó en unos segundos (pull lento, sin
  // acceso, o el estado "hidratando" quedó pegado), se deja de mostrar el
  // spinner y se cae en el aviso amigable.
  useEffect(() => {
    setHydrateTimedOut(false);
    const id = setTimeout(() => setHydrateTimedOut(true), HYDRATE_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [groupId]);

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

  // El grupo todavía no está en este dispositivo. Sólo se espera mientras haya
  // conexión, el motor lo esté trayendo y no se haya agotado el tope.
  if (
    group === null &&
    online &&
    !hydrateTimedOut &&
    hydrating_group_ids.includes(groupId)
  ) {
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
          description={
            online ? t("group:notFoundBody") : t("group:notFoundOffline")
          }
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
