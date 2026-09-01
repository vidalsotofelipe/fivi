import { adminRoute, badRequest, ok } from "@/lib/adminHandler";
import { isUuid, pageArgs, rpc, sp, str } from "@/lib/adminQuery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Consulta del log de auditoría administrativa. Filtros: admin, action, entity, rango. */
export const GET = adminRoute(async (req) => {
  const p = sp(req);
  const { limit, offset } = pageArgs(p, { maxLimit: 200, defLimit: 50 });
  const admin = str(p, "admin");
  if (admin && !isUuid(admin)) return badRequest("admin inválido");
  const data = await rpc("admin_audit_query", {
    p_admin: admin,
    p_action: str(p, "action"),
    p_entity: str(p, "entity"),
    p_from: str(p, "from"),
    p_to: str(p, "to"),
    p_limit: limit,
    p_offset: offset,
  });
  return ok(data);
});
