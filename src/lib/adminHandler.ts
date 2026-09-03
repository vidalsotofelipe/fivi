/**
 * Envoltura común para los Route Handlers del panel admin:
 *  - verifica permisos (`requireAdmin`) y corta con el status correcto,
 *  - inyecta un helper `audit(...)` que escribe en `admin_audit_log`,
 *  - normaliza los errores (nunca filtra detalles internos al cliente).
 */
import { NextResponse } from "next/server";
import {
  ACCESS_KEY_ADMIN_ID,
  AdminAuthError,
  requireAdmin,
  type AdminIdentity,
} from "./adminAuth";
import { getAdminClient } from "./supabaseAdmin";

export interface AuditEvent {
  action: string;
  entity?: string;
  entityId?: string | null;
  result?: "ok" | "error" | "denied";
  metadata?: Record<string, unknown>;
}

export interface AdminCtx extends AdminIdentity {
  /**
   * `adminId` como UUID para pasar a las funciones SQL (`p_by uuid`), o `null`
   * cuando se entró con la llave compartida (no hay un usuario detrás). Usar
   * este y NO `adminId` para argumentos `uuid` de Postgres.
   */
  adminUserId: string | null;
  /** Registra una acción administrativa. Nunca lanza (la auditoría no corta la operación). */
  audit: (e: AuditEvent) => Promise<void>;
}

type RouteParams = Record<string, string>;
/** Forma del 2º argumento que Next pasa a un Route Handler (App Router, Next 15). */
type RouteContext = { params: Promise<RouteParams> };
type Handler = (
  req: Request,
  ctx: AdminCtx,
  params: RouteParams,
) => Promise<Response> | Response;

async function writeAudit(adminId: string, e: AuditEvent): Promise<void> {
  // Con la llave de acceso compartida no hay un usuario detrás: `admin_user_id`
  // (uuid) queda en null y el modo se anota en `metadata` para no perder el rastro.
  const byKey = adminId === ACCESS_KEY_ADMIN_ID;
  try {
    await getAdminClient()
      .from("admin_audit_log")
      .insert({
        admin_user_id: byKey ? null : adminId,
        action: e.action,
        entity: e.entity ?? null,
        entity_id: e.entityId ?? null,
        result: e.result ?? "ok",
        metadata: byKey
          ? { ...(e.metadata ?? {}), auth: "access-key" }
          : (e.metadata ?? {}),
      });
  } catch (err) {
    console.error("[admin] audit failed:", (err as Error)?.message);
  }
}

/** `export const GET = adminRoute(async (req, ctx, params) => { ... })` */
export function adminRoute(fn: Handler) {
  return async (req: Request, route: RouteContext): Promise<Response> => {
    let ident: AdminIdentity;
    try {
      ident = await requireAdmin(req);
    } catch (e) {
      const err = e instanceof AdminAuthError ? e : new AdminAuthError(401, "No autorizado");
      return NextResponse.json({ error: err.message }, { status: err.status });
    }

    const ctx: AdminCtx = {
      ...ident,
      adminUserId:
        ident.adminId === ACCESS_KEY_ADMIN_ID ? null : ident.adminId,
      audit: (e) => writeAudit(ident.adminId, e),
    };

    try {
      // Rutas sin segmento dinámico se invocan sin `route`; las dinámicas traen
      // `params` como Promise en Next 15 (a veces ya resuelto en versiones viejas).
      const raw = (route as RouteContext | undefined)?.params as
        | Promise<RouteParams>
        | RouteParams
        | undefined;
      const params = raw ? await raw : {};
      return await fn(req, ctx, params);
    } catch (e) {
      console.error("[admin] handler error:", (e as Error)?.message, (e as Error)?.stack);
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }
  };
}

/** Respuesta JSON consistente. */
export function ok(data: unknown, init?: ResponseInit): Response {
  return NextResponse.json(data, init);
}

export function badRequest(message: string): Response {
  return NextResponse.json({ error: message }, { status: 400 });
}
