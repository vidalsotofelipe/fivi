/**
 * Cliente de Supabase + sesión anónima (Etapa 7). Este módulo importa
 * `@supabase/supabase-js`, así que se carga de forma **diferida** (dynamic
 * import) sólo cuando hay credenciales configuradas. La lectura de credenciales
 * vive en `supabaseConfig.ts` para no arrastrar la librería al bundle general.
 *
 * Autenticación: se usa **Anonymous Sign-In**. No se pide email ni contraseña.
 * La sesión se persiste con el mecanismo estándar de Supabase (`localStorage`),
 * así el mismo dispositivo mantiene su identidad entre recargas y offline. La
 * publishable/anon key NO es un usuario: hace falta la sesión anónima para que
 * RLS deje pasar (ver migración 0007).
 */

import {
  createClient,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import type { SupabaseConfig } from "./supabaseConfig";

export type { SupabaseConfig } from "./supabaseConfig";
export { readSupabaseConfig } from "./supabaseConfig";

let cached: SupabaseClient | null = null;

export function getSupabaseClient(config: SupabaseConfig): SupabaseClient {
  if (!cached) {
    cached = createClient(config.url, config.anonKey, {
      auth: {
        // Persistir + refrescar la sesión anónima (mecanismo estándar).
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
      realtime: { params: { eventsPerSecond: 5 } },
    });
  }
  return cached;
}

/**
 * Devuelve la sesión actual; si no hay, crea un usuario anónimo con
 * `signInAnonymously()`. Tras obtener la sesión, autoriza el canal Realtime con
 * el access token (necesario para que `postgres_changes` respete RLS).
 *
 * Lanza si el sign-in anónimo falla (p. ej. está deshabilitado en el proyecto).
 * El llamador decide qué hacer; la app puede seguir funcionando en local.
 */
export async function ensureAnonymousSession(
  client: SupabaseClient,
): Promise<Session | null> {
  const { data: existing } = await client.auth.getSession();
  let session = existing.session;

  if (!session) {
    const { data, error } = await client.auth.signInAnonymously();
    if (error) throw error;
    session = data.session;
  }

  if (session) client.realtime.setAuth(session.access_token);
  return session;
}

/** id del usuario actual (anónimo), o `null` si no hay sesión. */
export async function getCurrentUserId(
  client: SupabaseClient,
): Promise<string | null> {
  const { data } = await client.auth.getSession();
  return data.session?.user.id ?? null;
}
