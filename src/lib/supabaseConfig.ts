/**
 * Lectura de credenciales de Supabase desde variables de entorno.
 *
 * Este módulo NO importa `@supabase/supabase-js` a propósito: lo usa el
 * `SyncProvider` de forma estática para decidir el modo (cloud / local) sin
 * arrastrar la librería al bundle de quienes trabajan sólo en local.
 */

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export function readSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}
