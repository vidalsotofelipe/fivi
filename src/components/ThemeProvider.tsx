"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type ThemePref = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "fivi:theme";

/** Colores del `<meta name="theme-color">` por tema (deben coincidir con --bg). */
const META_COLOR: Record<ResolvedTheme, string> = {
  light: "#f4f2e8",
  dark: "#191816",
};

export function isThemePref(v: unknown): v is ThemePref {
  return v === "system" || v === "light" || v === "dark";
}

function systemDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches === true
  );
}

/** Aplica el tema al `<html>` y actualiza `<meta name="theme-color">`. */
export function applyTheme(pref: ThemePref): ResolvedTheme {
  const resolved: ResolvedTheme =
    pref === "system" ? (systemDark() ? "dark" : "light") : pref;
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", META_COLOR[resolved]);
  return resolved;
}

interface ThemeContextValue {
  /** Preferencia elegida (persistida). */
  theme: ThemePref;
  /** Tema efectivo tras resolver "system". */
  resolved: ResolvedTheme;
  setTheme: (t: ThemePref) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  resolved: "light",
  setTheme: () => {},
});

/**
 * Tema Sistema / Claro / Oscuro. La preferencia vive en `localStorage`
 * (`fivi:theme`); un script en `<head>` la aplica antes del primer paint para
 * que no haya flash. Este provider la mantiene reactiva y sigue los cambios del
 * SO cuando la preferencia es "system".
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePref>("system");
  const [resolved, setResolved] = useState<ResolvedTheme>("light");

  useEffect(() => {
    let initial: ThemePref = "system";
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (isThemePref(stored)) initial = stored;
    } catch {
      /* storage bloqueado */
    }
    setThemeState(initial);
    setResolved(applyTheme(initial));

    // Cuando la preferencia es "system", seguir los cambios del SO en vivo.
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      setThemeState((cur) => {
        if (cur === "system") setResolved(applyTheme("system"));
        return cur;
      });
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const setTheme = useCallback((next: ThemePref) => {
    setThemeState(next);
    setResolved(applyTheme(next));
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* sin persistencia: no rompe */
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

/** Script (sin JSX) que corre en `<head>` antes del paint para evitar el flash. */
export const themeInitScript = `(function(){try{var p=localStorage.getItem('${STORAGE_KEY}');if(p==='light'||p==='dark'){document.documentElement.setAttribute('data-theme',p);}var d=(p==='dark')||((p===null||p==='system')&&matchMedia('(prefers-color-scheme: dark)').matches);var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',d?'#191816':'#f4f2e8');}catch(e){}})();`;
