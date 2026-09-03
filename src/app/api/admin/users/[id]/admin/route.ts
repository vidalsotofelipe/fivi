import { adminRoute, badRequest, ok } from "@/lib/adminHandler";
import { isUuid, rpc } from "@/lib/adminQuery";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Concede / quita el rol de administrador global.
 * Body: `{ "make": boolean }`.
 *
 * Protecciones (en `admin_set_user_admin` + trigger `app_admins_prevent_last_delete`):
 *  - nunca se puede quitar el último administrador;
 *  - quitarse a sí mismo el rol sólo funciona si queda otro admin.
 */
export const POST = adminRoute(async (req, ctx, params) => {
  const id = params.id ?? "";
  if (!isUuid(id)) return badRequest("id inválido");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Body JSON inválido");
  }
  const make = (body as { make?: unknown })?.make;
  if (typeof make !== "boolean") return badRequest("Falta 'make' (boolean)");

  try {
    const data = await rpc<{ is_admin: boolean; admin_count: number }>("admin_set_user_admin", {
      p_uid: id,
      p_make: make,
      p_by: ctx.adminUserId, // uuid o null (llave compartida)
    });
    await ctx.audit({
      action: make ? "admin.grant" : "admin.revoke",
      entity: "user",
      entityId: id,
      metadata: { self: id === ctx.adminUserId, admin_count: data.admin_count },
    });
    return ok(data);
  } catch (e) {
    const err = e as Error & { pgcode?: string };
    await ctx.audit({
      action: make ? "admin.grant" : "admin.revoke",
      entity: "user",
      entityId: id,
      result: "denied",
      metadata: { reason: err.message },
    });
    if (err.pgcode === "P0001") return NextResponse.json({ error: err.message }, { status: 409 });
    throw e;
  }
});
