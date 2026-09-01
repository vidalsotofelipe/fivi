/**
 * Cliente Supabase con **service-role** para el panel de administración.
 *
 * ⚠️ SÓLO SERVIDOR. Bypassa RLS: cualquier Route Handler que lo use DEBE llamar
 * `requireAdmin(req)` primero. Nunca importar desde un componente cliente.
 *
 * La clave vive en `SUPABASE_SERVICE_ROLE_KEY` (sin prefijo `NEXT_PUBLIC_`), así
 * que Next no la incluye en el bundle del navegador; si por error se importara
 * en el cliente, `key` sería `undefined` y esto lanzaría.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function adminConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

export function getAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Panel admin no configurado: falta SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  cached ??= createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return cached;
}
