"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Group, Participant } from "@/domain/types";

export interface GroupContextValue {
  group: Group;
  participants: Participant[];
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
