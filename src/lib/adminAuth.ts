/**
 * Autorización del panel de administración.
 *
 * Cada endpoint bajo `/api/admin/*` llama `requireAdmin(req)`. Hay dos modos,
 * en este orden:
 *
 *  1. **Llave de acceso** (etapa actual): si existe `ADMIN_ACCESS_KEY`, un
 *     bearer token igual a esa llave alcanza. Secreto compartido, sin usuarios:
 *     evita tener que crear cuentas a mano mientras el panel está en pruebas.
 *  2. **Sesión de administrador** (etapa siguiente): el bearer token se valida
 *     contra Supabase Auth y el usuario debe estar en `public.app_admins`.
 *
 * Nunca se confía en nada del cliente: ambos caminos se verifican en el servidor.
 */
import { timingSafeEqual } from "node:crypto";
import { getAdminClient } from "./supabaseAdmin";

export type AdminAuthStatus = 401 | 403 | 503;

export class AdminAuthError extends Error {
  constructor(
    public readonly status: AdminAuthStatus,
    message: string,
  ) {
    super(message);
    this.name = "AdminAuthError";
  }
}

export interface AdminIdentity {
  adminId: string;
  email: string | null;
}

function bearerToken(req: Request): string {
  const h = req.headers.get("authorization") ?? "";
  return /^bearer /i.test(h) ? h.slice(7).trim() : "";
}

/** id de admin sintético cuando se entra con la llave compartida. */
export const ACCESS_KEY_ADMIN_ID = "access-key";

/** Comparación en tiempo constante (no filtra el largo ni el prefijo). */
function secretsMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Devuelve la identidad del admin autenticado o lanza `AdminAuthError`:
 *  - 401 sin token / token inválido
 *  - 403 autenticado pero no es admin
 *  - 503 backend admin sin configurar (falta service-role)
 */
export async function requireAdmin(req: Request): Promise<AdminIdentity> {
  const token = bearerToken(req);
  if (!token) throw new AdminAuthError(401, "No autenticado");

  // Modo 1: llave de acceso compartida.
  const accessKey = process.env.ADMIN_ACCESS_KEY;
  if (accessKey && accessKey.length >= 16 && secretsMatch(token, accessKey)) {
    return { adminId: ACCESS_KEY_ADMIN_ID, email: null };
  }

  // Modo 2: sesión de Supabase + pertenencia a app_admins.
  let admin;
  try {
    admin = getAdminClient();
  } catch {
    throw new AdminAuthError(503, "Panel admin no disponible");
  }

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new AdminAuthError(401, "Sesión inválida");
  const uid = data.user.id;

  const { data: row, error: qErr } = await admin
    .from("app_admins")
    .select("user_id")
    .eq("user_id", uid)
    .maybeSingle();
  if (qErr) throw new AdminAuthError(403, "No se pudo verificar permisos");
  if (!row) throw new AdminAuthError(403, "Acceso denegado");

  return { adminId: uid, email: data.user.email ?? null };
}
