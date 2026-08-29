"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/data/db";
import { SyncEngine } from "@/sync/SyncEngine";
import { createStubRemote } from "@/sync/stubRemote";
import { countPending } from "@/sync/queue";
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
  hydrating_group_ids: [],
  backend: "local",
};

const SyncContext = createContext<SyncStatus>(INITIAL);

export interface SyncActions {
  /** Pide sincronizar un grupo aunque no esté en la base local (acceso por enlace). */
  requestGroup: (groupId: string) => void;
}

const SyncActionsContext = createContext<SyncActions>({ requestGroup: () => {} });

const supabaseConfig = readSupabaseConfig();

/**
 * Arranca el motor de sincronización una vez para toda la app y expone su
 * estado. El `pending_count` se lee en vivo de IndexedDB (Optimistic UI,
 * sección 20).
 *
 * El motor arranca con `stubRemote` (sin red). Si hay credenciales de Supabase,
 * `@supabase/supabase-js` se carga de forma diferida y el remoto se cambia en
 * caliente con `engine.setRemote` — sin recrear el motor, para no perder el
 * estado ni los grupos que la UI ya pidió.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const [engineState, setEngineState] = useState<SyncState>(INITIAL);
  const backend: SyncBackend = supabaseConfig ? "cloud" : "local";
  const pending = useLiveQuery(() => countPending(db), [], 0);

  // Se crea en el render (no en un efecto) para que ya exista cuando los efectos
  // de los componentes hijos —que corren antes que el del padre— llamen a
  // `requestGroup`.
  const [engine] = useState(
    () =>
      new SyncEngine({
        remote: createStubRemote({ latencyMs: 400 }),
        database: db,
        pollIntervalMs: 20_000,
        cloudMode: Boolean(supabaseConfig),
      }),
  );

  useEffect(() => {
    const unsubscribe = engine.subscribe(setEngineState);
    engine.start();

    let cancelled = false;
    if (supabaseConfig) {
      void Promise.all([
        import("@/sync/supabaseRemote"),
        import("@/lib/supabase"),
      ])
        .then(([{ createSupabaseRemote }, { getSupabaseClient }]) => {
          if (!cancelled) {
            void engine.setRemote(
              createSupabaseRemote(getSupabaseClient(supabaseConfig)),
            );
          }
        })
        .catch((err) => {
          console.warn("No se pudo cargar el remoto Supabase:", err);
          // No dejar grupos "cargando" para siempre si el import falló.
          void engine.markRemoteReady();
        });
    }

    return () => {
      cancelled = true;
      unsubscribe();
      engine.stop();
    };
  }, [engine]);

  useEffect(() => {
    if (pending > 0) {
      const t = setTimeout(() => void engine.syncNow(), 300);
      return () => clearTimeout(t);
    }
  }, [engine, pending]);

  const value = useMemo<SyncStatus>(
    () => ({ ...engineState, pending_count: pending, backend }),
    [engineState, pending, backend],
  );

  const actions = useMemo<SyncActions>(
    () => ({ requestGroup: (groupId) => engine.trackGroup(groupId) }),
    [engine],
  );

  return (
    <SyncContext.Provider value={value}>
      <SyncActionsContext.Provider value={actions}>
        {children}
      </SyncActionsContext.Provider>
    </SyncContext.Provider>
  );
}

export function useSyncState(): SyncStatus {
  return useContext(SyncContext);
}

export function useSyncActions(): SyncActions {
  return useContext(SyncActionsContext);
}
