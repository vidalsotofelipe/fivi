"use client";

import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { LinkButton } from "@/components/Button";
import { EmptyState, Loading } from "@/components/EmptyState";
import { GroupContextProvider } from "@/components/GroupProvider";
import { useGroup, useParticipants } from "@/lib/db-hooks";

/**
 * Carga el grupo y sus participantes una sola vez para todas las pantallas de
 * `/g/[groupId]`. Si el grupo no existe (id inventado en un enlace), muestra
 * un estado claro en lugar de romper.
 */
export default function GroupLayout({ children }: { children: ReactNode }) {
  const { groupId } = useParams<{ groupId: string }>();
  const group = useGroup(groupId);
  const participants = useParticipants(groupId);

  if (group === undefined || participants === undefined) {
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
          description="Puede que el enlace sea incorrecto o que todavía no se haya sincronizado."
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
