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
    const onChanged = (lng: string) => {
      const next = isLang(lng) ? lng : "es";
      setLangState(next);
      document.documentElement.lang = next;
    };

    // El listener va PRIMERO. Con los recursos embebidos `changeLanguage`
    // resuelve de inmediato y emite `languageChanged` en el acto: si se
    // registraba después, el evento inicial se perdía y el estado de React
    // quedaba en "es" mientras i18next ya estaba en "en". De ahí el desfasaje
    // que se veía: textos en inglés, `<html lang="en">`, pero el selector
    // marcando "Español" y las fechas en español.
    i18n.on("languageChanged", onChanged);

    const initial = detectInitialLang();
    if (initial !== i18n.language) void i18n.changeLanguage(initial);
    // Y además se fija explícitamente, por si el idioma ya era el correcto y
    // `changeLanguage` no emite nada.
    onChanged(initial);

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
