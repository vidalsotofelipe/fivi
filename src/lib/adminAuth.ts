/**
 * Autorización del panel de administración.
 *
 * Cada endpoint bajo `/api/admin/*` llama `requireAdmin(req)`: verifica el
 * bearer token del request contra Supabase Auth y comprueba que el usuario esté
 * en `public.app_admins`. No se confía en nada del cliente.
 */
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

/**
 * Devuelve la identidad del admin autenticado o lanza `AdminAuthError`:
 *  - 401 sin token / token inválido
 *  - 403 autenticado pero no es admin
 *  - 503 backend admin sin configurar (falta service-role)
 */
export async function requireAdmin(req: Request): Promise<AdminIdentity> {
  const token = bearerToken(req);
  if (!token) throw new AdminAuthError(401, "No autenticado");

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
