/**
 * Guarda/actualiza la suscripción Web Push de este dispositivo para un
 * grupo puntual. Ruta pública (como `/api/feedback`), pero exige un JWT
 * válido en `Authorization: Bearer` — el `uid` de la fila sale de ahí,
 * **nunca** de un campo mandado por el cliente, para que un dispositivo no
 * pueda escribir la suscripción de otro.
 *
 * `push_subscriptions` es default-deny por RLS (ver migración 0020): el
 * cliente no puede escribirla directo por PostgREST, sólo por acá.
 */
import { NextResponse } from "next/server";
import { getAdminClient, adminConfigured } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ENDPOINT = 2000;
const MAX_KEY = 500;

function isNonEmptyString(v: unknown, max: number): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= max;
}

export async function POST(req: Request): Promise<Response> {
  if (!adminConfigured()) {
    return NextResponse.json({ error: "No disponible" }, { status: 503 });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    return NextResponse.json({ error: "Falta autenticación" }, { status: 401 });
  }

  const admin = getAdminClient();
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData?.user) {
    return NextResponse.json({ error: "Sesión inválida" }, { status: 401 });
  }
  const userId = userData.user.id;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const groupId = b.groupId;
  const participantId = b.participantId;
  const enabled = b.enabled !== false;

  if (typeof groupId !== "string" || typeof participantId !== "string") {
    return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
  }

  // Apagar el aviso no necesita la suscripción del navegador: sólo marca
  // `enabled = false` en la fila que ya existe (si no existe, no hay nada que
  // apagar — no es un error). Evita pedirle al cliente que vuelva a resolver
  // el endpoint/claves sólo para desactivar.
  if (!enabled) {
    const { error: updateError } = await admin
      .from("push_subscriptions")
      .update({ enabled: false, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("group_id", groupId);
    if (updateError) {
      console.error("[notifications/subscribe] update falló:", updateError.message);
      return NextResponse.json({ error: "No se pudo guardar" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  const sub = b.subscription as
    | { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }
    | undefined;
  if (
    !isNonEmptyString(sub?.endpoint, MAX_ENDPOINT) ||
    !isNonEmptyString(sub?.keys?.p256dh, MAX_KEY) ||
    !isNonEmptyString(sub?.keys?.auth, MAX_KEY)
  ) {
    return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
  }

  // El participante tiene que ser realmente del grupo que se dice: chequeo
  // liviano de integridad, no de permisos (esta ruta ya verificó el JWT).
  const { data: participant } = await admin
    .from("participants")
    .select("id")
    .eq("id", participantId)
    .eq("group_id", groupId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!participant) {
    return NextResponse.json({ error: "Participante inválido" }, { status: 400 });
  }

  const { error: upsertError } = await admin.from("push_subscriptions").upsert(
    {
      user_id: userId,
      group_id: groupId,
      participant_id: participantId,
      endpoint: sub.endpoint,
      p256dh: sub.keys!.p256dh,
      auth_key: sub.keys!.auth,
      enabled: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,group_id" },
  );

  if (upsertError) {
    console.error("[notifications/subscribe] upsert falló:", upsertError.message);
    return NextResponse.json({ error: "No se pudo guardar" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
