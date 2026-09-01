import { adminRoute, badRequest } from "@/lib/adminHandler";
import { isUuid, rpc, sortArgs, sp, str } from "@/lib/adminQuery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Tope duro de filas por exportación (evita descargas gigantes). */
const MAX_ROWS = 5000;
const SORTS = ["created_at", "amount_minor", "occurred_on"] as const;

interface MovRow {
  type: string;
  id: string;
  group_id: string;
  group_name: string;
  currency: string;
  amount_minor: number;
  description: string | null;
  occurred_on: string;
  created_at: string;
}

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV de los movimientos que matcheen los filtros (mismos que GET
 * /api/admin/movimientos), hasta `MAX_ROWS`. El monto va en unidad mínima
 * (entero) + el código de moneda; el consumidor formatea según la moneda.
 */
export const GET = adminRoute(async (req, ctx) => {
  const p = sp(req);
  const { sort, dir } = sortArgs(p, SORTS, "created_at");
  const type = str(p, "type");
  if (type && type !== "expense" && type !== "payment") return badRequest("type inválido");
  const group = str(p, "group");
  if (group && !isUuid(group)) return badRequest("group inválido");

  const args = {
    p_type: type,
    p_group: group,
    p_currency: str(p, "currency"),
    p_search: str(p, "search"),
    p_from: str(p, "from"),
    p_to: str(p, "to"),
    p_sort: sort,
    p_dir: dir,
    p_limit: MAX_ROWS,
    p_offset: 0,
  };
  const res = await rpc<{ total: number; rows: MovRow[] }>("admin_list_movements", args);
  const rows = res.rows ?? [];

  const header = [
    "tipo",
    "id",
    "grupo_id",
    "grupo",
    "moneda",
    "monto_unidad_minima",
    "descripcion",
    "fecha",
    "creado_en",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.type,
        r.id,
        r.group_id,
        r.group_name,
        r.currency,
        r.amount_minor,
        r.description ?? "",
        r.occurred_on,
        r.created_at,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  // BOM para que Excel abra el CSV como UTF-8.
  const csv = "﻿" + lines.join("\r\n") + "\r\n";

  await ctx.audit({
    action: "movimientos.export",
    entity: "movimiento",
    result: "ok",
    metadata: { rows: rows.length, total: res.total, truncated: res.total > rows.length, filters: args },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="fivi-movimientos-${stamp}.csv"`,
    },
  });
});
