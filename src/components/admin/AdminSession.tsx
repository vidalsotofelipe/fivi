"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { adminSupabaseConfigured, getAdminSupabase } from "@/lib/adminSupabase";
import { readAdminKey, writeAdminKey } from "@/lib/adminKey";

export interface AdminSessionValue {
  /** `true` mientras se resuelve la sesión inicial. */
  loading: boolean;
  /** Supabase configurado en el entorno. Si es `false`, el panel no está disponible. */
  configured: boolean;
  /** Email del admin autenticado, o `null` (siempre `null` con llave de acceso). */
  email: string | null;
  /** Access token actual (Bearer para `/api/admin/*`), o `null`. */
  token: string | null;
  /** `true` si se entró con la llave compartida y no con una cuenta. */
  byAccessKey: boolean;
  /** Guarda la llave de acceso en este navegador. */
  signInWithKey: (key: string) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AdminSessionValue | null>(null);

/**
 * Mantiene la sesión del panel y la expone a `AdminGuard` / `adminFetch`.
 * No arranca nada de la app.
 *
 * Dos modos: la **llave de acceso** guardada en este navegador (etapa actual) o
 * una sesión de Supabase con storageKey propio (etapa siguiente). Si hay llave,
 * gana y ni se carga el cliente de Supabase.
 */
export function AdminSession({ children }: { children: ReactNode }) {
  const configured = adminSupabaseConfigured();
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [byAccessKey, setByAccessKey] = useState(false);
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const key = readAdminKey();
    if (key) {
      setToken(key);
      setByAccessKey(true);
      setLoading(false);
      return;
    }
    if (!configured) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    void getAdminSupabase().then((client) => {
      if (!client || cancelled) return;
      void client.auth.getSession().then(({ data }) => {
        if (cancelled) return;
        setToken(data.session?.access_token ?? null);
        setEmail(data.session?.user.email ?? null);
        setLoading(false);
      });
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        setToken(session?.access_token ?? null);
        setEmail(session?.user.email ?? null);
        setLoading(false);
      });
      unsubRef.current = () => data.subscription.unsubscribe();
    });

    return () => {
      cancelled = true;
      unsubRef.current?.();
    };
  }, [configured]);

  const signInWithKey = useCallback((key: string) => {
    const clean = key.trim();
    writeAdminKey(clean);
    setToken(clean);
    setByAccessKey(true);
    setEmail(null);
    setLoading(false);
  }, []);

  const signIn = useCallback(async (mail: string, password: string) => {
    const client = await getAdminSupabase();
    if (!client) throw new Error("El panel no está configurado en este entorno.");
    const { error } = await client.auth.signInWithPassword({ email: mail, password });
    if (error) {
      throw new Error(
        /invalid login credentials/i.test(error.message)
          ? "Email o contraseña incorrectos."
          : error.message,
      );
    }
  }, []);

  const signOut = useCallback(async () => {
    writeAdminKey(null);
    setByAccessKey(false);
    if (adminSupabaseConfigured()) {
      const client = await getAdminSupabase();
      await client?.auth.signOut();
    }
    setToken(null);
    setEmail(null);
  }, []);

  const value = useMemo<AdminSessionValue>(
    () => ({
      loading,
      configured,
      email,
      token,
      byAccessKey,
      signInWithKey,
      signIn,
      signOut,
    }),
    [loading, configured, email, token, byAccessKey, signInWithKey, signIn, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdminSession(): AdminSessionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAdminSession fuera de <AdminSession>");
  return v;
}
