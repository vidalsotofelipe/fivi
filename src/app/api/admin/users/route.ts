import { adminRoute, ok } from "@/lib/adminHandler";
import { pageArgs, rpc, sortArgs, sp, str } from "@/lib/adminQuery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SORTS = ["created_at", "last_sign_in_at", "email"] as const;

/** Listado paginado de usuarios (auth.users) con agregados de uso. */
export const GET = adminRoute(async (req) => {
  const p = sp(req);
  const { limit, offset } = pageArgs(p);
  const { sort, dir } = sortArgs(p, SORTS, "created_at");
  const data = await rpc("admin_list_users", {
    p_search: str(p, "search"),
    p_status: str(p, "status"),
    p_role: str(p, "role"),
    p_from: str(p, "from"),
    p_to: str(p, "to"),
    p_sort: sort,
    p_dir: dir,
    p_limit: limit,
    p_offset: offset,
  });
  return ok(data);
});
