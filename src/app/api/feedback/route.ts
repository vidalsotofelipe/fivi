import { NextResponse } from "next/server";
import { getAdminClient, adminConfigured } from "@/lib/supabaseAdmin";
import { newId } from "@/data/ids";
import { appInfo } from "@/lib/appInfo";
import { parseBrowser, parseDeviceType, parseOperatingSystem } from "@/lib/uaParse";
import {
  extensionFor,
  isFeedbackType,
  sanitizePagePath,
  sniffImageType,
  validateFeedbackFields,
  SCREENSHOT_MAX_BYTES,
  USER_AGENT_MAX,
} from "@/lib/feedbackShared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCREENSHOT_BUCKET = "feedback-screenshots";

/**
 * Antispam liviano, sin infraestructura nueva:
 *  - por `device_id` (persistente, vía la propia tabla): máx. 5 envíos cada
 *    10 minutos. Sobrevive cold starts.
 *  - por IP (en memoria del proceso, best-effort): mismo límite, para quien
 *    llega sin `device_id` (storage bloqueado). Se reinicia en cada cold
 *    start; es una capa extra, no la única.
 * Nunca se persiste la IP: sólo vive en memoria para este chequeo.
 */
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 5;
const ipHits = new Map<string, number[]>();

function ipRateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  hits.push(now);
  ipHits.set(ip, hits);
  // Poda ocasional para no crecer sin límite en una instancia longeva.
  if (ipHits.size > 5000) ipHits.clear();
  return hits.length > RATE_MAX;
}

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || "unknown";
}

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v : "";
}

function optStr(v: FormDataEntryValue | null): string | undefined {
  const s = str(v).trim();
  return s === "" ? undefined : s;
}

/** Enums pequeños que sólo reflejan estado real de la interfaz del cliente. */
function enumOrNull<T extends string>(v: string | undefined, allowed: readonly T[]): T | null {
  return v && (allowed as readonly string[]).includes(v) ? (v as T) : null;
}

export async function POST(req: Request): Promise<Response> {
  if (!adminConfigured()) {
    return NextResponse.json({ error: "No disponible" }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  const fields = {
    type: str(form.get("type")),
    title: str(form.get("title")),
    description: str(form.get("description")),
    contactEmail: optStr(form.get("contactEmail")),
    stepsToReproduce: optStr(form.get("stepsToReproduce")),
    expectedBehavior: optStr(form.get("expectedBehavior")),
  };
  const errors = validateFeedbackFields(fields);
  if (errors.length > 0) {
    return NextResponse.json({ error: "Revisá los campos", fields: errors }, { status: 400 });
  }
  if (!isFeedbackType(fields.type)) {
    // validateFeedbackFields ya lo cubre, pero angosta el tipo para lo que sigue.
    return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
  }

  const deviceId = optStr(form.get("deviceId"))?.slice(0, 100) ?? null;
  const admin = getAdminClient();

  // Antispam: por device_id contra la propia tabla (persistente).
  if (deviceId) {
    const { count } = await admin
      .from("feedback")
      .select("id", { count: "exact", head: true })
      .eq("device_id", deviceId)
      .gte("created_at", new Date(Date.now() - RATE_WINDOW_MS).toISOString());
    if ((count ?? 0) >= RATE_MAX) {
      return NextResponse.json(
        { error: "Demasiados envíos. Probá de nuevo en unos minutos." },
        { status: 429 },
      );
    }
  } else if (ipRateLimited(clientIp(req))) {
    return NextResponse.json(
      { error: "Demasiados envíos. Probá de nuevo en unos minutos." },
      { status: 429 },
    );
  }

  // Metadata técnica: lo que decide el servidor (autoritativo, no falsificable
  // por el cliente) + lo que sólo el cliente puede saber (tema, viewport…).
  const userAgent = (req.headers.get("user-agent") ?? "").slice(0, USER_AGENT_MAX);
  const language = enumOrNull(optStr(form.get("language")), ["es", "en"] as const);
  const theme = enumOrNull(optStr(form.get("theme")), ["light", "dark", "system"] as const);
  const viewport = optStr(form.get("viewport"))?.slice(0, 20) ?? null;
  const pagePath = sanitizePagePath(optStr(form.get("pagePath")) ?? null);

  const id = newId();
  let screenshotPath: string | null = null;

  const screenshot = form.get("screenshot");
  if (screenshot instanceof File && screenshot.size > 0) {
    if (screenshot.size > SCREENSHOT_MAX_BYTES) {
      return NextResponse.json(
        { error: "La captura no puede superar los 5 MB" },
        { status: 400 },
      );
    }
    const bytes = new Uint8Array(await screenshot.arrayBuffer());
    const sniffed = sniffImageType(bytes);
    if (!sniffed) {
      return NextResponse.json(
        { error: "La captura debe ser una imagen JPG, PNG o WEBP" },
        { status: 400 },
      );
    }
    const path = `${id}/${newId()}.${extensionFor(sniffed)}`;
    const { error: uploadError } = await admin.storage
      .from(SCREENSHOT_BUCKET)
      .upload(path, bytes, { contentType: sniffed, upsert: false });
    if (uploadError) {
      console.error("[feedback] upload falló:", uploadError.message);
      return NextResponse.json(
        { error: "No se pudo subir la captura. Probá sin ella o de nuevo." },
        { status: 502 },
      );
    }
    screenshotPath = path;
  }

  const { error: insertError } = await admin.from("feedback").insert({
    id,
    type: fields.type,
    title: fields.title.trim(),
    description: fields.description.trim(),
    contact_email: fields.contactEmail ?? null,
    steps_to_reproduce: fields.stepsToReproduce ?? null,
    expected_behavior: fields.expectedBehavior ?? null,
    screenshot_path: screenshotPath,
    status: "new",
    app_version: appInfo.version,
    environment: appInfo.environment,
    language,
    theme,
    browser: parseBrowser(userAgent),
    operating_system: parseOperatingSystem(userAgent),
    device_type: parseDeviceType(userAgent),
    viewport,
    page_path: pagePath,
    user_agent: userAgent || null,
    device_id: deviceId,
  });

  if (insertError) {
    console.error("[feedback] insert falló:", insertError.message);
    // La captura ya subió: no queda huérfana para siempre, pero tampoco hay
    // fila que la referencie. Se intenta limpiar sin bloquear la respuesta.
    if (screenshotPath) {
      void admin.storage.from(SCREENSHOT_BUCKET).remove([screenshotPath]);
    }
    return NextResponse.json({ error: "No se pudo guardar el feedback" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
