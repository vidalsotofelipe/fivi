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
 * Pide permiso (si hace falta) y devuelve la suscripción push del
 * dispositivo, reusando la existente si ya había una. `null` si el
 * navegador no soporta push, si el permiso queda denegado, o ante cualquier
 * error — nunca lanza.
 */
export async function subscribeToPush(): Promise<WebPushSubscription | null> {
  if (!isPushSupported()) return null;
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) return null;

  try {
    const permission =
      Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();
    if (permission !== "granted") return null;

    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      }));

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return null;
    return {
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    };
  } catch {
    return null;
  }
}
