import { adminRoute, badRequest, ok } from "@/lib/adminHandler";
import { isUuid, rpc } from "@/lib/adminQuery";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Activa / desactiva un usuario (baja lógica vía `auth.users.banned_until`).
 * Body: `{ "ban": boolean }`. No permite desactivar a un administrador.
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
  const ban = (body as { ban?: unknown })?.ban;
  if (typeof ban !== "boolean") return badRequest("Falta 'ban' (boolean)");

  try {
    const data = await rpc<{ banned_until: string | null }>("admin_set_user_ban", {
      p_uid: id,
      p_ban: ban,
    });
    await ctx.audit({
      action: ban ? "user.deactivate" : "user.activate",
      entity: "user",
      entityId: id,
      metadata: { banned_until: data.banned_until },
    });
    return ok(data);
  } catch (e) {
    const err = e as Error & { pgcode?: string };
    await ctx.audit({
      action: ban ? "user.deactivate" : "user.activate",
      entity: "user",
      entityId: id,
      result: "denied",
      metadata: { reason: err.message },
    });
    if (err.pgcode === "P0001") return NextResponse.json({ error: err.message }, { status: 409 });
    if (err.pgcode === "P0002") return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    throw e;
  }
});
