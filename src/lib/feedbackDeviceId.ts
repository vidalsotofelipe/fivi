/**
 * Id anónimo local para correlacionar el feedback de un mismo dispositivo (uso
 * interno: contadores del panel admin y límite antispam). Vive sólo en
 * `localStorage`, no es un dato personal identificable, y NUNCA se usa para
 * otra cosa que enviar feedback — no se crea uno para nada más de la app.
 */
const KEY = "fivi:feedback-device-id";

export function getOrCreateFeedbackDeviceId(): string | null {
  try {
    const existing = window.localStorage.getItem(KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    window.localStorage.setItem(KEY, id);
    return id;
  } catch {
    return null; // storage bloqueado (modo privado, etc.): se envía sin id
  }
}
