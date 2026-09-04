"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Group, Participant } from "@/domain/types";

export interface GroupContextValue {
  group: Group;
  /** Participantes VIVOS: los que se pueden elegir (checkboxes, selectores). */
  participants: Participant[];
  /**
   * Todos los que alguna vez estuvieron, incluidos los quitados. Sólo para
   * **resolver nombres** en saldos, "quién le debe a quién" y actividad: un
   * participante quitado conserva sus movimientos, así que su nombre tiene que
   * seguir apareciendo (antes salía "—").
   */
  allParticipants: Participant[];
}

const GroupContext = createContext<GroupContextValue | null>(null);

export function GroupContextProvider({
  value,
  children,
}: {
  value: GroupContextValue;
  children: ReactNode;
}) {
  return (
    <GroupContext.Provider value={value}>{children}</GroupContext.Provider>
  );
}

/** Grupo + participantes ya cargados por el layout de `/g/[groupId]`. */
export function useGroupContext(): GroupContextValue {
  const ctx = useContext(GroupContext);
  if (!ctx) {
    throw new Error("useGroupContext debe usarse dentro de /g/[groupId]");
  }
  return ctx;
}
