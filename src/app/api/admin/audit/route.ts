import { adminRoute, badRequest, ok } from "@/lib/adminHandler";
import { dateRangeInvalid, isUuid, pageArgs, rpc, sp, str } from "@/lib/adminQuery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Consulta del log de auditoría administrativa. Filtros: admin, action, entity, rango. */
export const GET = adminRoute(async (req) => {
  const p = sp(req);
  const { limit, offset } = pageArgs(p, { maxLimit: 200, defLimit: 50 });
  const admin = str(p, "admin");
  if (admin && !isUuid(admin)) return badRequest("admin inválido");
  const from = str(p, "from");
  const to = str(p, "to");
  if (dateRangeInvalid(from, to)) {
    return badRequest("La fecha desde no puede ser posterior a la fecha hasta");
  }
  const data = await rpc("admin_audit_query", {
    p_admin: admin,
    p_action: str(p, "action"),
    p_entity: str(p, "entity"),
    p_from: from,
    p_to: to,
    p_limit: limit,
    p_offset: offset,
  });
  return ok(data);
});
