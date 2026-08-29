"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/data/db";
import { SyncEngine } from "@/sync/SyncEngine";
import { createStubRemote } from "@/sync/stubRemote";
import { countPending } from "@/sync/queue";
import type { SyncState } from "@/sync/types";

const INITIAL: SyncState = {
  online: true,
  syncing: false,
  pending_count: 0,
  last_synced_at: null,
  last_error: null,
};

const SyncContext = createContext<SyncState>(INITIAL);

/**
 * Arranca el motor de sincronización una vez para toda la app y expone su
 * estado. El `pending_count` se lee en vivo de IndexedDB para que el indicador
 * reaccione al instante a cada cambio (Optimistic UI, sección 20); el resto del
 * estado lo emite el motor. Cada vez que aparecen cambios nuevos se dispara una
 * sincronización (sección 17). Hoy el remoto es `stubRemote` (sin red).
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const [engineState, setEngineState] = useState<SyncState>(INITIAL);
  const engineRef = useRef<SyncEngine | null>(null);
  const pending = useLiveQuery(() => countPending(db), [], 0);

  useEffect(() => {
    const engine = new SyncEngine({
      remote: createStubRemote({ latencyMs: 400 }),
      database: db,
      pollIntervalMs: 20_000,
    });
    engineRef.current = engine;
    const unsubscribe = engine.subscribe(setEngineState);
    engine.start();
    return () => {
      unsubscribe();
      engine.stop();
      engineRef.current = null;
    };
  }, []);

  // Al aparecer operaciones pendientes, intentar sincronizar enseguida.
  useEffect(() => {
    if (pending > 0) {
      const t = setTimeout(() => void engineRef.current?.syncNow(), 300);
      return () => clearTimeout(t);
    }
  }, [pending]);

  const value = useMemo<SyncState>(
    () => ({ ...engineState, pending_count: pending }),
    [engineState, pending],
  );

  return (
    <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
  );
}

export function useSyncState(): SyncState {
  return useContext(SyncContext);
}
