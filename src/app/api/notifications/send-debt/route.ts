/**
 * Recalcula los saldos de un grupo y manda un push a cada dispositivo
 * suscripto cuyo participante quedó con saldo negativo (le deben, o mejor
 * dicho: debe) — sólo lado deudor, no se avisa a quien le deben.
 *
 * La llama el cliente, sin bloquear el sync, justo después de un push
 * exitoso a la cola pendiente (ver `SyncEngine.syncNow`). Ruta pública (como
 * `/api/feedback`): no hace falta sesión porque no expone nada que el
 * llamador no pueda ya inferir con el `group_id` (que ya tiene, si está
 * sincronizando ese grupo), y todo el trabajo sensible —leer quién está
 * suscripto y mandarle el push— pasa server-side con `service_role`.
 *
 * De-duplicación: cada suscripción guarda `last_notified_balance_minor`. Sólo
 * se manda push si el saldo es más negativo que la última vez que se avisó
 * (deuda nueva o más grande); si mejoró o no cambió, se actualiza el valor
 * guardado en silencio, sin mandar nada — así no se repite el aviso en cada
 * sync mientras la deuda siga igual.
 */
import { NextResponse } from "next/server";
import webpush from "web-push";
import { getAdminClient, adminConfigured } from "@/lib/supabaseAdmin";
import { computeBalances } from "@/domain/balances";
import { formatMoney } from "@/domain/money";
import type { CurrencyCode } from "@/domain/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 30;
const hits = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > RATE_MAX;
}

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || "unknown";
}

function vapidConfigured(): boolean {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT,
  );
}

interface PushSubscriptionRow {
  id: string;
  participant_id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
  last_notified_balance_minor: number;
}

export async function POST(req: Request): Promise<Response> {
  if (!adminConfigured()) {
    return NextResponse.json({ error: "No disponible" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }
  const groupId = (body as { groupId?: unknown }).groupId;
  if (typeof groupId !== "string" || groupId.length === 0) {
    return NextResponse.json({ error: "Falta groupId" }, { status: 400 });
  }

  if (rateLimited(`${clientIp(req)}:${groupId}`)) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }

  const admin = getAdminClient();

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, participant_id, endpoint, p256dh, auth_key, last_notified_balance_minor")
    .eq("group_id", groupId)
    .eq("enabled", true);
  const subscriptions = (subs ?? []) as PushSubscriptionRow[];

  // Nadie suscripto en este grupo: no hace falta ni traer el resto de los datos.
  if (subscriptions.length === 0) {
    return NextResponse.json({ ok: true, notified: 0 });
  }

  const [{ data: group }, { data: participants }, { data: expenses }, { data: payments }] =
    await Promise.all([
      admin.from("groups").select("name, currency_code").eq("id", groupId).maybeSingle(),
      admin.from("participants").select("id").eq("group_id", groupId).is("deleted_at", null),
      admin
        .from("expenses")
        .select("id, paid_by, amount_minor_units")
        .eq("group_id", groupId)
        .is("deleted_at", null),
      admin
        .from("payments")
        .select("from_participant, to_participant, amount_minor_units")
        .eq("group_id", groupId)
        .is("deleted_at", null),
    ]);
  if (!group) {
    return NextResponse.json({ error: "Grupo inexistente" }, { status: 404 });
  }

  const expenseIds = (expenses ?? []).map((e) => e.id as string);
  const { data: shares } =
    expenseIds.length > 0
      ? await admin
          .from("expense_participants")
          .select("expense_id, participant_id, share_minor_units")
          .in("expense_id", expenseIds)
          .is("deleted_at", null)
      : { data: [] };

  const balances = computeBalances({
    participant_ids: (participants ?? []).map((p) => p.id as string),
    expenses: expenses ?? [],
    shares: shares ?? [],
    payments: payments ?? [],
  });
  const balanceByParticipant = new Map(
    balances.map((b) => [b.participant_id, b.balance_minor]),
  );

  const canSend = vapidConfigured();
  if (canSend) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT!,
      process.env.VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    );
  }

  let notified = 0;
  await Promise.all(
    subscriptions.map(async (sub) => {
      const balance = balanceByParticipant.get(sub.participant_id) ?? 0;
      const isNewOrBiggerDebt =
        balance < 0 && balance < sub.last_notified_balance_minor;

      if (isNewOrBiggerDebt) {
        // Sin claves VAPID: no se manda nada y tampoco se actualiza el
        // valor guardado, para reintentar apenas se configuren.
        if (!canSend) return;
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth_key },
            },
            JSON.stringify({
              title: "fivi",
              body: `Debés ${formatMoney(Math.abs(balance), group.currency_code as CurrencyCode)} en "${group.name}"`,
              url: `/g/${groupId}/balance`,
            }),
          );
          notified++;
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            // Suscripción muerta (el navegador la revocó): se descarta.
            await admin.from("push_subscriptions").delete().eq("id", sub.id);
            return;
          }
          console.error("[notifications/send-debt] envío falló:", err);
          // No se actualiza last_notified_balance_minor: se reintenta en el
          // próximo sync en vez de darla por avisada sin haberlo logrado.
          return;
        }
      }

      await admin
        .from("push_subscriptions")
        .update({ last_notified_balance_minor: balance, updated_at: new Date().toISOString() })
        .eq("id", sub.id);
    }),
  );

  return NextResponse.json({ ok: true, notified });
}
