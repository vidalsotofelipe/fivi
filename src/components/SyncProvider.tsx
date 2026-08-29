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
import type { RemotePort } from "@/sync/RemotePort";
import type { SyncState } from "@/sync/types";
import { readSupabaseConfig } from "@/lib/supabaseConfig";

export type SyncBackend = "cloud" | "local";

export interface SyncStatus extends SyncState {
  /** "cloud" si hay Supabase configurado; "local" si se trabaja sólo en el dispositivo. */
  backend: SyncBackend;
}

const INITIAL: SyncStatus = {
  online: true,
  syncing: false,
  pending_count: 0,
  last_synced_at: null,
  last_error: null,
  backend: "local",
};

const SyncContext = createContext<SyncStatus>(INITIAL);

const supabaseConfig = readSupabaseConfig();

/**
 * Arranca el motor de sincronización una vez para toda la app y expone su
 * estado. El `pending_count` se lee en vivo de IndexedDB para que el indicador
 * reaccione al instante (Optimistic UI, sección 20).
 *
 * El remoto arranca como `stubRemote` (sin red). Si hay credenciales de
 * Supabase, el módulo pesado (`@supabase/supabase-js`) se carga de forma
 * diferida y el motor se reinicia con el remoto real, sin inflar el bundle de
 * quienes trabajan sólo en local.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const [engineState, setEngineState] = useState<SyncState>(INITIAL);
  const [remote, setRemote] = useState<RemotePort>(() =>
    createStubRemote({ latencyMs: 400 }),
  );
  const engineRef = useRef<SyncEngine | null>(null);
  const backend: SyncBackend = supabaseConfig ? "cloud" : "local";
  const pending = useLiveQuery(() => countPending(db), [], 0);

  // Carga diferida del remoto Supabase.
  useEffect(() => {
    if (!supabaseConfig) return;
    let cancelled = false;
    void Promise.all([
      import("@/sync/supabaseRemote"),
      import("@/lib/supabase"),
    ]).then(([{ createSupabaseRemote }, { getSupabaseClient }]) => {
      if (!cancelled) {
        setRemote(() => createSupabaseRemote(getSupabaseClient(supabaseConfig)));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const engine = new SyncEngine({
      remote,
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
  }, [remote]);

  useEffect(() => {
    if (pending > 0) {
      const t = setTimeout(() => void engineRef.current?.syncNow(), 300);
      return () => clearTimeout(t);
    }
  }, [pending]);

  const value = useMemo<SyncStatus>(
    () => ({ ...engineState, pending_count: pending, backend }),
    [engineState, pending, backend],
  );

  return (
    <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
  );
}

export function useSyncState(): SyncStatus {
  return useContext(SyncContext);
}
