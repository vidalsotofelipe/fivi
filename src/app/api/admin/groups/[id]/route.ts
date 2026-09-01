import { adminRoute, badRequest, ok } from "@/lib/adminHandler";
import { isUuid, rpc } from "@/lib/adminQuery";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Detalle de un grupo: participantes, miembros y totales de gastos/pagos. */
export const GET = adminRoute(async (_req, _ctx, params) => {
  const id = params.id ?? "";
  if (!isUuid(id)) return badRequest("id inválido");
  const data = await rpc("admin_get_group", { p_gid: id });
  if (data == null) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return ok(data);
});
