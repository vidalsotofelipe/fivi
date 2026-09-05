/**
 * Parser de User-Agent minúsculo, sólo para metadata de diagnóstico del panel
 * admin (browser / SO / tipo de dispositivo). Heurístico, no exhaustivo: no
 * vale la pena una dependencia nueva para un campo secundario que sólo se
 * muestra en un bloque técnico expandible.
 */

export function parseBrowser(ua: string): string | null {
  if (!ua) return null;
  // El orden importa: Edge y Opera también matchean "Chrome" en su UA.
  if (/edg\//i.test(ua)) return "Edge";
  if (/opr\//i.test(ua) || /opera/i.test(ua)) return "Opera";
  if (/firefox\//i.test(ua)) return "Firefox";
  if (/crios\//i.test(ua)) return "Chrome (iOS)";
  if (/fxios\//i.test(ua)) return "Firefox (iOS)";
  if (/chrome\//i.test(ua)) return "Chrome";
  if (/safari\//i.test(ua) && /version\//i.test(ua)) return "Safari";
  return null;
}

export function parseOperatingSystem(ua: string): string | null {
  if (!ua) return null;
  if (/windows/i.test(ua)) return "Windows";
  if (/iphone|ipad|ipod/i.test(ua)) return "iOS";
  if (/mac os x/i.test(ua)) return "macOS";
  if (/android/i.test(ua)) return "Android";
  if (/cros/i.test(ua)) return "ChromeOS";
  if (/linux/i.test(ua)) return "Linux";
  return null;
}

export type DeviceType = "mobile" | "tablet" | "desktop";

export function parseDeviceType(ua: string): DeviceType {
  if (/ipad|tablet/i.test(ua)) return "tablet";
  if (/mobi|iphone|android/i.test(ua)) return "mobile";
  return "desktop";
}
