import { adminRoute, badRequest, ok } from "@/lib/adminHandler";
import { isUuid, rpc } from "@/lib/adminQuery";
import { isFeedbackStatus } from "@/lib/feedbackShared";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Cambia el estado de un feedback. Body: `{ "status": "reviewing" }`. */
export const POST = adminRoute(async (req, ctx, params) => {
  const id = params.id ?? "";
  if (!isUuid(id)) return badRequest("id inválido");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Body JSON inválido");
  }
  const status = (body as { status?: unknown })?.status;
  if (!isFeedbackStatus(status)) return badRequest("status inválido");

  try {
    const data = await rpc<{ id: string; status: string; updated_at: string }>(
      "admin_set_feedback_status",
      { p_id: id, p_status: status },
    );
    await ctx.audit({
      action: "feedback.status",
      entity: "feedback",
      entityId: id,
      metadata: { status },
    });
    return ok(data);
  } catch (e) {
    const err = e as Error & { pgcode?: string };
    await ctx.audit({
      action: "feedback.status",
      entity: "feedback",
      entityId: id,
      result: "denied",
      metadata: { reason: err.message, status },
    });
    if (err.pgcode === "P0002") return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    if (err.pgcode === "P0001") return NextResponse.json({ error: err.message }, { status: 400 });
    throw e;
  }
});
