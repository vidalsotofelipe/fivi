import { adminRoute, badRequest, ok } from "@/lib/adminHandler";
import { rpc } from "@/lib/adminQuery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Configuración general del panel. Sólo se aceptan claves conocidas y valores
 * validados en el backend; cada cambio queda auditado. Sin secretos.
 */
type Validator = (v: unknown) => { ok: true; value: unknown } | { ok: false; error: string };

const KEYS: Record<string, Validator> = {
  default_currency: (v) =>
    typeof v === "string" && /^[A-Z]{3}$/.test(v)
      ? { ok: true, value: v }
      : { ok: false, error: "default_currency debe ser un código ISO 4217 (3 letras mayúsculas)" },
  feature_flags: (v) => {
    if (v == null || typeof v !== "object" || Array.isArray(v))
      return { ok: false, error: "feature_flags debe ser un objeto" };
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val !== "boolean") return { ok: false, error: `feature_flags.${k} debe ser boolean` };
    }
    return { ok: true, value: v };
  },
};

export const GET = adminRoute(async () => {
  const data = await rpc("admin_settings_get", {});
  return ok({ settings: data, keys: Object.keys(KEYS) });
});

export const PATCH = adminRoute(async (req, ctx) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Body JSON inválido");
  }
  const key = (body as { key?: unknown })?.key;
  if (typeof key !== "string" || !(key in KEYS)) return badRequest("Clave desconocida");

  const check = KEYS[key]!((body as { value?: unknown }).value);
  if (!check.ok) return badRequest(check.error);

  const data = await rpc("admin_settings_set", {
    p_key: key,
    p_value: check.value,
    p_by: ctx.adminId,
  });
  await ctx.audit({
    action: "settings.update",
    entity: "setting",
    entityId: key,
    metadata: { value: check.value },
  });
  return ok(data);
});
