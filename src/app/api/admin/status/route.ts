import { adminRoute, ok } from "@/lib/adminHandler";
import { rpc } from "@/lib/adminQuery";
import { appInfo } from "@/lib/appInfo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function timed<T>(fn: () => Promise<T>): Promise<{ ok: boolean; ms: number; error?: string }> {
  const t0 = Date.now();
  try {
    await fn();
    return { ok: true, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, error: (e as Error).message };
  }
}

/**
 * Diagnóstico seguro: versión / commit / entorno + alcanzabilidad de la base y
 * de Supabase Auth. NO expone env vars, connection strings ni claves.
 */
export const GET = adminRoute(async () => {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

  const db = await timed(() => rpc("admin_settings_get", {}));
  const auth = await timed(async () => {
    if (!supaUrl) throw new Error("SUPABASE_URL no configurada");
    // `/auth/v1/health` exige `apikey`; sin ella devuelve 401 y el chequeo daba
    // un falso negativo. Se usa la clave pública (la misma que va al navegador).
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!anonKey) throw new Error("SUPABASE_ANON_KEY no configurada");
    const r = await fetch(`${supaUrl}/auth/v1/health`, {
      headers: { apikey: anonKey },
      cache: "no-store",
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
  });

  return ok({
    app: {
      version: appInfo.version,
      commit: appInfo.commit,
      environment: appInfo.environment,
    },
    checks: {
      database: db,
      supabase_auth: auth,
    },
    supabase_host: supaUrl ? new URL(supaUrl).host : null,
    checked_at: new Date().toISOString(),
  });
});
