import { adminRoute, badRequest, ok } from "@/lib/adminHandler";
import { dateRangeInvalid, pageArgs, rpc, sortArgs, sp, str } from "@/lib/adminQuery";
import { isFeedbackStatus, isFeedbackType } from "@/lib/feedbackShared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SORTS = ["created_at", "status", "type"] as const;

/** Listado paginado de feedback, con contadores por estado. Sólo lectura. */
export const GET = adminRoute(async (req) => {
  const p = sp(req);
  const { limit, offset } = pageArgs(p, { maxLimit: 200 });
  const { sort, dir } = sortArgs(p, SORTS, "created_at");

  const status = str(p, "status");
  if (status && !isFeedbackStatus(status)) return badRequest("status inválido");
  const type = str(p, "type");
  if (type && !isFeedbackType(type)) return badRequest("type inválido");

  const from = str(p, "from");
  const to = str(p, "to");
  if (dateRangeInvalid(from, to)) {
    return badRequest("La fecha desde no puede ser posterior a la fecha hasta");
  }

  const data = await rpc("admin_list_feedback", {
    p_status: status,
    p_type: type,
    p_search: str(p, "search"),
    p_from: from,
    p_to: to,
    p_version: str(p, "version"),
    p_env: str(p, "environment"),
    p_sort: sort,
    p_dir: dir,
    p_limit: limit,
    p_offset: offset,
  });
  return ok(data);
});
