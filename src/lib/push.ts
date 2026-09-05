/**
 * Suscripción del navegador a Web Push. Sólo permiso + `pushManager.subscribe`
 * — guardar la suscripción en el servidor (`/api/notifications/subscribe`) es
 * responsabilidad de quien llama, no de este módulo.
 */

/** `PushManager.subscribe` necesita la clave VAPID como `Uint8Array`, no base64url. */
function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * iOS Safari sólo soporta Web Push si la PWA está instalada a la pantalla de
 * inicio (`display: standalone`) — instalar es un paso manual, no
 * automatizable. En cualquier otro navegador esto da `false` (no aplica).
 */
export function needsIosInstall(): boolean {
  if (typeof navigator === "undefined") return false;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia?.("(display-mode: standalone)").matches;
  return isIos && !isStandalone;
}

export interface WebPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * Por qué no se pudo suscribir. Cada motivo tiene una acción distinta del
 * lado del usuario, así que se devuelven separados en vez de un `null`
 * opaco: "no se pudo activar" a secas obliga a abrir la consola para saber
 * si el problema es el permiso, el navegador o el servidor.
 */
export type PushFailureReason =
  | "unsupported"
  | "no-vapid-key"
  | "permission-denied"
  | "browser-error";

export type PushSubscribeResult =
  | { ok: true; subscription: WebPushSubscription }
  | { ok: false; reason: PushFailureReason; detail?: string };

/**
 * Pide permiso (si hace falta) y devuelve la suscripción push del
 * dispositivo, reusando la existente si ya había una. Nunca lanza: ante
 * cualquier problema devuelve `ok: false` con el motivo.
 */
export async function subscribeToPush(): Promise<PushSubscribeResult> {
  if (!isPushSupported()) return { ok: false, reason: "unsupported" };
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) return { ok: false, reason: "no-vapid-key" };

  let permission: NotificationPermission;
  try {
    permission =
      Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();
  } catch (err) {
    return { ok: false, reason: "browser-error", detail: errorName(err) };
  }
  if (permission !== "granted") return { ok: false, reason: "permission-denied" };

  try {
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      }));

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { ok: false, reason: "browser-error", detail: "suscripción incompleta" };
    }
    return {
      ok: true,
      subscription: {
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      },
    };
  } catch (err) {
    // Los dos típicos: `NotAllowedError` (el permiso no llegó a esta pestaña,
    // hay que recargar) y `AbortError` (el navegador no pudo hablar con su
    // servicio de push: bloqueador, VPN o firewall).
    return { ok: false, reason: "browser-error", detail: errorName(err) };
  }
}

function errorName(err: unknown): string {
  if (err instanceof Error) return err.name || err.message;
  return String(err);
}
