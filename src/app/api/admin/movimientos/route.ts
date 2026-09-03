import { adminRoute, badRequest, ok } from "@/lib/adminHandler";
import {
  dateRangeInvalid,
  isUuid,
  pageArgs,
  rpc,
  sortArgs,
  sp,
  str,
} from "@/lib/adminQuery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SORTS = ["created_at", "amount_minor", "occurred_on"] as const;

/**
 * Movimientos = gastos + pagos unificados. Sólo lectura (no se edita ni borra
 * dato financiero desde el panel). Filtros: type, group, currency, search, rango.
 */
export const GET = adminRoute(async (req) => {
  const p = sp(req);
  const { limit, offset } = pageArgs(p, { maxLimit: 200 });
  const { sort, dir } = sortArgs(p, SORTS, "created_at");

  const type = str(p, "type");
  if (type && type !== "expense" && type !== "payment") return badRequest("type inválido");
  const group = str(p, "group");
  if (group && !isUuid(group)) return badRequest("group inválido");

  const from = str(p, "from");
  const to = str(p, "to");
  if (dateRangeInvalid(from, to)) {
    return badRequest("La fecha desde no puede ser posterior a la fecha hasta");
  }

  const data = await rpc("admin_list_movements", {
    p_type: type,
    p_group: group,
    p_currency: str(p, "currency"),
    p_search: str(p, "search"),
    p_from: from,
    p_to: to,
    p_sort: sort,
    p_dir: dir,
    p_limit: limit,
    p_offset: offset,
  });
  return ok(data);
});
