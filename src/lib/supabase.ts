/**
 * Cliente de Supabase. Este módulo importa `@supabase/supabase-js`, así que se
 * carga de forma **diferida** (dynamic import) sólo cuando hay credenciales
 * configuradas. La lectura de credenciales vive en `supabaseConfig.ts` para no
 * arrastrar la librería al bundle general.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { SupabaseConfig } from "./supabaseConfig";

export type { SupabaseConfig } from "./supabaseConfig";
export { readSupabaseConfig } from "./supabaseConfig";

let cached: SupabaseClient | null = null;

export function getSupabaseClient(config: SupabaseConfig): SupabaseClient {
  if (!cached) {
    cached = createClient(config.url, config.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 5 } },
    });
  }
  return cached;
}
