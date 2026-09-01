"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/data/db";
import { SyncEngine } from "@/sync/SyncEngine";
import { createStubRemote } from "@/sync/stubRemote";
import { getQueueStats } from "@/sync/queue";
import type { GroupRole } from "@/sync/RemotePort";
import type { InviteInfo, SyncState } from "@/sync/types";
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
  exhausted_count: 0,
  last_synced_at: null,
  last_error: null,
  access_error: null,
  remote_ready: true,
  hydrating_group_ids: [],
  backend: "local",
};

const SyncContext = createContext<SyncStatus>(INITIAL);

export interface SyncActions {
  /** Pide sincronizar un grupo aunque no esté en la base local (acceso por enlace). */
  requestGroup: (groupId: string) => void;
  /**
   * Botón "Reintentar": devuelve a la cola los cambios que agotaron los
   * reintentos y fuerza una corrida.
   */
  syncNow: () => Promise<void>;
  /** id del usuario anónimo actual (Supabase), o `null` (modo local o sin sesión). */
  userId: string | null;
  /** Canjea un token de invitación; devuelve el id del grupo al que da acceso. */
  redeemInvite: (token: string) => Promise<string>;
  /** Crea una invitación para un grupo; devuelve el token crudo (se muestra una vez). */
  createInvite: (
    groupId: string,
    opts?: { expiresInDays?: number; maxUses?: number },
  ) => Promise<{ token: string; id: string }>;
  listInvites: (groupId: string) => Promise<InviteInfo[]>;
  revokeInvite: (inviteId: string) => Promise<void>;
  getGroupRole: (groupId: string) => Promise<GroupRole | null>;
}

const NOOP_ACTIONS: SyncActions = {
  requestGroup: () => {},
  syncNow: () => Promise.resolve(),
  userId: null,
  redeemInvite: () =>
    Promise.reject(new Error("Las invitaciones requieren Supabase configurado")),
  createInvite: () =>
    Promise.reject(new Error("Las invitaciones requieren Supabase configurado")),
  listInvites: () => Promise.resolve([]),
  revokeInvite: () => Promise.resolve(),
  getGroupRole: () => Promise.resolve(null),
};

const SyncActionsContext = createContext<SyncActions>(NOOP_ACTIONS);

const supabaseConfig = readSupabaseConfig();

/**
 * Arranca el motor de sincronización una vez para toda la app y expone su
 * estado. El `pending_count` se lee en vivo de IndexedDB (Optimistic UI,
 * sección 20).
 *
 * El motor arranca con `stubRemote` (sin red). Si hay credenciales de Supabase,
 * `@supabase/supabase-js` se carga de forma diferida, se asegura una **sesión
 * anónima** (sin email ni contraseña) y el remoto se cambia en caliente con
 * `engine.setRemote` — sin recrear el motor. Si el sign-in anónimo falla, se
 * pasa a cloud igual: los push/pull fallarán por RLS y quedarán pendientes hasta
 * que la auth funcione (la app sigue andando en local mientras tanto).
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const backend: SyncBackend = supabaseConfig ? "cloud" : "local";
  // El panel `/admin` no usa el motor local-first ni la sesión anónima de la
  // app: tiene su propia sesión (email + contraseña) y habla con /api/admin/*.
  const isAdminRoute = (usePathname() ?? "").startsWith("/admin");
  const queueStats = useLiveQuery(() => getQueueStats(db), [], {
    pending: 0,
    exhausted: 0,
    syncing: 0,
    synced: 0,
  });

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

  // Se siembra con el estado REAL del motor, no con `INITIAL`: en modo cloud el
  // motor arranca con `remote_ready: false` (el stub inicial no habla con
  // Supabase). Sembrar con `INITIAL` (que trae `remote_ready: true`) hacía que,
  // al abrir directamente `/join/<token>`, el efecto de la página viera
  // `remote_ready` en `true` antes de que el remoto real cargara y canjeara la
  // invitación contra el stub → "Las invitaciones requieren Supabase configurado".
  const [engineState, setEngineState] = useState<SyncState>(() => engine.getState());

  useEffect(() => {
    if (isAdminRoute) return; // no arrancar el motor en el panel admin

    const unsubscribe = engine.subscribe(setEngineState);
    engine.start();

    let cancelled = false;
    let authUnsub: (() => void) | undefined;
    let onOnline: (() => void) | undefined;

    if (supabaseConfig) {
      void Promise.all([
        import("@/sync/supabaseRemote"),
        import("@/lib/supabase"),
      ])
        .then(async ([{ createSupabaseRemote }, mod]) => {
          if (cancelled) return;
          const { getSupabaseClient, ensureAnonymousSession } = mod;
          const client = getSupabaseClient(supabaseConfig);

          // Sesión anónima. Si falla (deshabilitada, o sin red al arrancar) se
          // sigue igual: los push/pull fallarán por RLS y quedarán pendientes.
          const tryAuth = async () => {
            try {
              const session = await ensureAnonymousSession(client);
              if (!cancelled) setUserId(session?.user.id ?? null);
            } catch (err) {
              console.warn("No se pudo iniciar sesión anónima en Supabase:", err);
            }
          };
          await tryAuth();

          // Si arrancó sin sesión (offline), reintentar al volver la conexión.
          onOnline = () => void tryAuth();
          if (typeof window !== "undefined") {
            window.addEventListener("online", onOnline);
          }

          // Mantener Realtime autorizado y re-sincronizar al refrescar el token.
          const { data } = client.auth.onAuthStateChange((event, session) => {
            if (session) client.realtime.setAuth(session.access_token);
            setUserId(session?.user.id ?? null);
            // Sesión nueva: cambian las condiciones, así que se les da otra
            // chance a los cambios que el servidor había rechazado (típico
            // cuando la sesión anterior quedó inválida y todo se "agotó").
            if (event === "SIGNED_IN") {
              void engine.retryFailed();
            } else if (event === "TOKEN_REFRESHED") {
              void engine.syncNow(true);
            }
          });
          authUnsub = () => data.subscription.unsubscribe();

          if (cancelled) {
            authUnsub();
            if (onOnline && typeof window !== "undefined") {
              window.removeEventListener("online", onOnline);
            }
            return;
          }
          void engine.setRemote(createSupabaseRemote(client));
        })
        .catch((err) => {
          console.warn("No se pudo cargar el remoto Supabase:", err);
          // No dejar grupos "cargando" para siempre si el import falló.
          void engine.markRemoteReady();
        });
    }

    return () => {
      cancelled = true;
      authUnsub?.();
      if (onOnline && typeof window !== "undefined") {
        window.removeEventListener("online", onOnline);
      }
      unsubscribe();
      engine.stop();
    };
  }, [engine, isAdminRoute]);

  useEffect(() => {
    if (isAdminRoute) return;
    if (queueStats.pending > 0) {
      const t = setTimeout(() => void engine.syncNow(), 300);
      return () => clearTimeout(t);
    }
  }, [engine, queueStats.pending, isAdminRoute]);

  const value = useMemo<SyncStatus>(
    () => ({
      ...engineState,
      pending_count: queueStats.pending,
      exhausted_count: queueStats.exhausted,
      backend,
    }),
    [engineState, queueStats.pending, queueStats.exhausted, backend],
  );

  const actions = useMemo<SyncActions>(
    () => ({
      requestGroup: (groupId) => engine.trackGroup(groupId),
      // Es el "Reintentar" del usuario: además de forzar la corrida, devuelve a
      // la cola lo que había agotado los reintentos (si no, el botón no haría
      // nada para justamente el caso en que se lo muestra).
      syncNow: async () => {
        await engine.retryFailed();
      },
      userId,
      redeemInvite: (token) => engine.redeemInvite(token),
      createInvite: (groupId, opts) => engine.createInvite(groupId, opts),
      listInvites: (groupId) => engine.listInvites(groupId),
      revokeInvite: (inviteId) => engine.revokeInvite(inviteId),
      getGroupRole: (groupId) => engine.getGroupRole(groupId),
    }),
    [engine, userId],
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
