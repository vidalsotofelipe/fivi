import { adminRoute, ok } from "@/lib/adminHandler";
import { pageArgs, rpc, sortArgs, sp, str } from "@/lib/adminQuery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SORTS = ["created_at", "name", "expense_count", "participant_count"] as const;

/** Listado paginado de grupos con contadores agregados. Sólo lectura. */
export const GET = adminRoute(async (req) => {
  const p = sp(req);
  const { limit, offset } = pageArgs(p);
  const { sort, dir } = sortArgs(p, SORTS, "created_at");
  const data = await rpc("admin_list_groups", {
    p_search: str(p, "search"),
    p_currency: str(p, "currency"),
    p_archived: str(p, "archived"),
    p_from: str(p, "from"),
    p_to: str(p, "to"),
    p_sort: sort,
    p_dir: dir,
    p_limit: limit,
    p_offset: offset,
  });
  return ok(data);
});
