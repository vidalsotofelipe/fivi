/**
 * Cliente Supabase **exclusivo del panel admin** (navegador).
 *
 * Usa un `storageKey` propio (`fivi-admin-auth`) para no mezclarse con la sesión
 * anónima de la app: son dos sesiones independientes en el mismo dominio. La
 * app sigue 100% anónima; el panel usa email + contraseña.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { readSupabaseConfig } from "./supabaseConfig";

let cached: SupabaseClient | null = null;

export function adminSupabaseConfigured(): boolean {
  return readSupabaseConfig() !== null;
}

/** Devuelve el cliente del panel, o `null` si Supabase no está configurado. */
export async function getAdminSupabase(): Promise<SupabaseClient | null> {
  if (cached) return cached;
  const config = readSupabaseConfig();
  if (!config) return null;
  const { createClient } = await import("@supabase/supabase-js");
  cached = createClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: "fivi-admin-auth",
    },
  });
  return cached;
}
