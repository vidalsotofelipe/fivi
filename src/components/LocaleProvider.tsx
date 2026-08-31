"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import i18n, {
  detectInitialLang,
  isLang,
  persistLang,
  type Lang,
} from "@/i18n/config";

interface LocaleContextValue {
  lang: Lang;
  /** Cambia el idioma en caliente y lo persiste. */
  setLang: (lang: Lang) => void;
}

const LocaleContext = createContext<LocaleContextValue>({
  lang: "es",
  setLang: () => {},
});

/**
 * Resuelve el idioma en el cliente (preferencia guardada > navegador > es),
 * mantiene `<html lang>` en sincronía y expone el idioma activo + un setter.
 * El SSR renderiza en español; si la preferencia es inglés, hay un re-render al
 * montar (español es el caso mayoritario).
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(
    isLang(i18n.language) ? i18n.language : "es",
  );

  useEffect(() => {
    const initial = detectInitialLang();
    if (initial !== i18n.language) void i18n.changeLanguage(initial);
    document.documentElement.lang = initial;

    const onChanged = (lng: string) => {
      setLangState(isLang(lng) ? lng : "es");
      document.documentElement.lang = isLang(lng) ? lng : "es";
    };
    i18n.on("languageChanged", onChanged);
    return () => {
      i18n.off("languageChanged", onChanged);
    };
  }, []);

  const setLang = (next: Lang) => {
    persistLang(next);
    void i18n.changeLanguage(next);
  };

  return (
    <LocaleContext.Provider value={{ lang, setLang }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext);
}
