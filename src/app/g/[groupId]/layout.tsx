"use client";

import { useParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { LinkButton } from "@/components/Button";
import { EmptyState, Loading } from "@/components/EmptyState";
import { GroupContextProvider } from "@/components/GroupProvider";
import { useSyncActions, useSyncState } from "@/components/SyncProvider";
import { useGroup, useParticipants } from "@/lib/db-hooks";

/**
 * Carga el grupo y sus participantes una sola vez para todas las pantallas de
 * `/g/[groupId]`. Si el grupo no está localmente (se abrió por enlace en otro
 * dispositivo), pide traerlo del servidor y espera a que termine el primer pull
 * antes de dar el enlace por perdido.
 */
export default function GroupLayout({ children }: { children: ReactNode }) {
  const { groupId } = useParams<{ groupId: string }>();
  const group = useGroup(groupId);
  const participants = useParticipants(groupId);
  const { requestGroup } = useSyncActions();
  const { hydrating_group_ids } = useSyncState();

  useEffect(() => {
    requestGroup(groupId);
  }, [groupId, requestGroup]);

  if (group === undefined || participants === undefined) {
    return (
      <AppShell title="fivi" back="/">
        <Loading />
      </AppShell>
    );
  }

  // Grupo aún no local pero se está trayendo del servidor: seguir esperando.
  if (group === null && hydrating_group_ids.includes(groupId)) {
    return (
      <AppShell title="fivi" back="/">
        <Loading />
      </AppShell>
    );
  }

  if (group === null) {
    return (
      <AppShell title="Grupo no encontrado" back="/">
        <EmptyState
          title="No pudimos abrir este grupo"
          description="Revisá que el enlace esté completo. Si lo compartió alguien recién, probá de nuevo en unos segundos."
          action={<LinkButton href="/">Volver al inicio</LinkButton>}
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
