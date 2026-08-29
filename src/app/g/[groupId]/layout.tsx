"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { LinkButton } from "@/components/Button";
import { EmptyState, Loading } from "@/components/EmptyState";
import { GroupContextProvider } from "@/components/GroupProvider";
import { useSyncActions, useSyncState } from "@/components/SyncProvider";
import { useGroup, useParticipants } from "@/lib/db-hooks";

/**
 * Carga el grupo y sus participantes una sola vez para todas las pantallas de
 * `/g/[groupId]`. Si el grupo no está localmente (se abrió por enlace en otro
 * dispositivo), pide traerlo del servidor antes de dar por perdido el enlace.
 */
export default function GroupLayout({ children }: { children: ReactNode }) {
  const { groupId } = useParams<{ groupId: string }>();
  const group = useGroup(groupId);
  const participants = useParticipants(groupId);
  const { requestGroup } = useSyncActions();
  const { backend } = useSyncState();
  const [waitedForPull, setWaitedForPull] = useState(false);

  useEffect(() => {
    requestGroup(groupId);
    setWaitedForPull(false);
    const t = setTimeout(() => setWaitedForPull(true), 6000);
    return () => clearTimeout(t);
  }, [groupId, requestGroup]);

  if (group === undefined || participants === undefined) {
    return (
      <AppShell title="fivi" back="/">
        <Loading />
      </AppShell>
    );
  }

  // Grupo aún no local: si hay servidor, esperar a que termine el primer pull.
  if (group === null && backend === "cloud" && !waitedForPull) {
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
          title="Este grupo no existe en este dispositivo"
          description={
            backend === "cloud"
              ? "El enlace puede ser incorrecto o el grupo todavía no se sincronizó."
              : "Puede que el enlace sea incorrecto o que todavía no se haya sincronizado."
          }
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
