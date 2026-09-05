import { adminRoute, badRequest, ok } from "@/lib/adminHandler";
import { isUuid, rpc } from "@/lib/adminQuery";
import { getAdminClient } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCREENSHOT_BUCKET = "feedback-screenshots";
/** Vida corta: la URL firmada no debe quedar utilizable mucho tiempo después de cargar la pantalla. */
const SIGNED_URL_TTL_SECONDS = 300;

interface FeedbackDetail {
  screenshot_path: string | null;
  [key: string]: unknown;
}

/**
 * Detalle de un feedback. La captura NUNCA se expone como ruta interna del
 * bucket: se reemplaza acá por una signed URL de corta vida (el bucket es
 * privado). Sin captura, `screenshot_url` viene `null`.
 */
export const GET = adminRoute(async (_req, _ctx, params) => {
  const id = params.id ?? "";
  if (!isUuid(id)) return badRequest("id inválido");

  const data = await rpc<FeedbackDetail | null>("admin_get_feedback", { p_id: id });
  if (data == null) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const { screenshot_path, ...rest } = data;
  let screenshot_url: string | null = null;
  if (screenshot_path) {
    const { data: signed } = await getAdminClient()
      .storage.from(SCREENSHOT_BUCKET)
      .createSignedUrl(screenshot_path, SIGNED_URL_TTL_SECONDS);
    screenshot_url = signed?.signedUrl ?? null;
  }

  return ok({ ...rest, screenshot_url });
});
