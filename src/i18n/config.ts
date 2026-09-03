/**
 * i18n de fivi (react-i18next). Recursos embebidos (sin backend): el `init` es
 * efectivamente sincrónico. Español es el idioma por defecto y el fallback: una
 * clave ausente en inglés cae al español; ausente en ambos, devuelve la clave.
 */
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import es from "./locales/es.json";
import en from "./locales/en.json";
import { LANG_STORAGE_KEY, langInitScript } from "./langScript";

export const SUPPORTED_LANGS = ["es", "en"] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];
export const DEFAULT_LANG: Lang = "es";
export { LANG_STORAGE_KEY, langInitScript };

/** BCP-47 para los formateadores `Intl`. */
export const BCP47: Record<Lang, string> = {
  es: "es-AR",
  en: "en-US",
};

export function isLang(v: unknown): v is Lang {
  return v === "es" || v === "en";
}

/** Idioma inicial: preferencia guardada > idioma del navegador > español. */
export function detectInitialLang(): Lang {
  if (typeof window !== "undefined") {
    try {
      const stored = window.localStorage.getItem(LANG_STORAGE_KEY);
      if (isLang(stored)) return stored;
    } catch {
      /* storage bloqueado (modo privado, etc.) */
    }
    const nav =
      typeof navigator !== "undefined" ? navigator.language || "" : "";
    if (nav.toLowerCase().startsWith("en")) return "en";
  }
  return DEFAULT_LANG;
}

export function persistLang(lang: Lang): void {
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    /* sin persistencia: se pierde al recargar, no rompe */
  }
}

if (!i18next.isInitialized) {
  // Arranca SIEMPRE en español, el idioma del SSR. Así el primer render del
  // cliente coincide byte a byte con el HTML del servidor y no hay mismatch de
  // hidratación (React #418). `LocaleProvider`, ya montado, aplica el idioma
  // efectivo (preferencia guardada > navegador) en un efecto: para un usuario
  // en inglés eso es un único re-render post-montaje, no un desajuste de
  // hidratación ni un parpadeo de contenido a mitad del árbol.
  void i18next.use(initReactI18next).init({
    resources: { es, en },
    lng: DEFAULT_LANG,
    fallbackLng: DEFAULT_LANG,
    ns: Object.keys(es),
    defaultNS: "common",
    interpolation: { escapeValue: false },
    returnNull: false,
    returnEmptyString: false,
    // Recursos embebidos: nunca hace falta suspender esperando cargas. Sin esto,
    // react-i18next suspende en SSR y rompe la hidratación (Next App Router).
    react: { useSuspense: false },
  });
}

export default i18next;
