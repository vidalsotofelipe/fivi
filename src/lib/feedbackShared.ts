/**
 * Constantes y validaciones de feedback compartidas entre el formulario
 * público (`/ajustes/feedback`) y el endpoint que lo recibe (`/api/feedback`).
 * Nada acá depende de Next ni de Supabase: son funciones puras, fáciles de
 * testear y de mantener en sincro entre cliente y servidor.
 */

export const FEEDBACK_TYPES = ["bug", "suggestion", "question", "other"] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export const FEEDBACK_STATUSES = [
  "new",
  "reviewing",
  "planned",
  "resolved",
  "discarded",
] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 4000;
export const BUG_FIELD_MAX = 2000;
export const EMAIL_MAX = 200;
export const PAGE_PATH_MAX = 200;
export const USER_AGENT_MAX = 300;

export function isFeedbackType(v: unknown): v is FeedbackType {
  return typeof v === "string" && (FEEDBACK_TYPES as readonly string[]).includes(v);
}

export function isFeedbackStatus(v: unknown): v is FeedbackStatus {
  return typeof v === "string" && (FEEDBACK_STATUSES as readonly string[]).includes(v);
}

/** Validación de forma, no de entregabilidad: alcanza para un campo opcional. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(v: string): boolean {
  return v.length <= EMAIL_MAX && EMAIL_RE.test(v);
}

/**
 * Sólo el pathname, sin query ni hash: ahí podrían viajar tokens de invitación
 * u otros parámetros sensibles (ver `src/app/join/[token]`). Acepta una URL
 * completa o ya sólo un pathname; en cualquier caso devuelve sólo el path.
 */
export function sanitizePagePath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let path: string;
  try {
    // Si viene con origin, `URL` lo resuelve; si no, lo resuelve contra una
    // base descartable sólo para poder parsear el pathname de forma uniforme.
    path = new URL(raw, "http://x").pathname;
  } catch {
    return null;
  }
  if (!path.startsWith("/")) path = `/${path}`;
  return path.slice(0, PAGE_PATH_MAX);
}

export interface FeedbackFormFields {
  type: string;
  title: string;
  description: string;
  contactEmail?: string;
  stepsToReproduce?: string;
  expectedBehavior?: string;
}

export interface FieldError {
  field: string;
  message: string;
}

/**
 * Valida los campos "de contenido" (no la metadata técnica, que el servidor
 * arma solo). Devuelve la lista de errores; vacía si todo está bien. Se usa
 * tanto en el cliente (feedback inmediato antes de enviar) como en el
 * servidor (nunca confiar sólo en la validación del cliente).
 */
export function validateFeedbackFields(f: FeedbackFormFields): FieldError[] {
  const errors: FieldError[] = [];

  if (!isFeedbackType(f.type)) {
    errors.push({ field: "type", message: "Elegí sobre qué querés escribir" });
  }

  const title = f.title.trim();
  if (!title) errors.push({ field: "title", message: "Ingresá un título" });
  else if (title.length > TITLE_MAX) {
    errors.push({ field: "title", message: `El título no puede superar los ${TITLE_MAX} caracteres` });
  }

  const description = f.description.trim();
  if (!description) errors.push({ field: "description", message: "Contanos qué pasó" });
  else if (description.length > DESCRIPTION_MAX) {
    errors.push({
      field: "description",
      message: `La descripción no puede superar los ${DESCRIPTION_MAX} caracteres`,
    });
  }

  if (f.contactEmail && f.contactEmail.trim() && !isValidEmail(f.contactEmail.trim())) {
    errors.push({ field: "contactEmail", message: "El email no parece válido" });
  }

  if (f.stepsToReproduce && f.stepsToReproduce.length > BUG_FIELD_MAX) {
    errors.push({ field: "stepsToReproduce", message: "Muy largo, contalo más corto" });
  }
  if (f.expectedBehavior && f.expectedBehavior.length > BUG_FIELD_MAX) {
    errors.push({ field: "expectedBehavior", message: "Muy largo, contalo más corto" });
  }

  return errors;
}

// ── Captura de pantalla ─────────────────────────────────────────────────────

export const SCREENSHOT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
export const SCREENSHOT_ACCEPT = "image/jpeg,image/png,image/webp";

export type SniffedImageType = "image/jpeg" | "image/png" | "image/webp";

/**
 * Determina el formato real de una imagen por sus primeros bytes ("magic
 * numbers"), en vez de confiar en el `Content-Type` declarado por el
 * navegador (trivial de falsificar). `null` si no matchea ninguno de los tres
 * formatos aceptados.
 */
export function sniffImageType(bytes: Uint8Array): SniffedImageType | null {
  if (bytes.length < 12) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  // WEBP: "RIFF"....."WEBP"
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  return null;
}

export function extensionFor(type: SniffedImageType): string {
  return { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[type];
}
