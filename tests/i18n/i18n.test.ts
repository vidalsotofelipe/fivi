import { afterEach, describe, expect, it, vi } from "vitest";
import i18n, { detectInitialLang } from "@/i18n/config";

afterEach(async () => {
  await i18n.changeLanguage("es");
  vi.unstubAllGlobals();
});

describe("catálogos i18n", () => {
  it("español es el idioma y el fallback por defecto", () => {
    expect(i18n.language).toBe("es");
    expect(i18n.t("common:continue")).toBe("Continuar");
  });

  it("cambia de idioma en caliente", async () => {
    await i18n.changeLanguage("en");
    expect(i18n.t("common:continue")).toBe("Continue");
    expect(i18n.t("nav:summary")).toBe("Summary");
  });

  it("interpola sin concatenar fragmentos", () => {
    expect(i18n.t("group:setupStep", { current: 2, total: 3 })).toBe(
      "Paso 2 de 3",
    );
    expect(i18n.t("expense:perPerson", { amount: "$ 12.150" })).toBe(
      "$ 12.150 por persona",
    );
  });

  it("pluraliza por idioma", async () => {
    expect(i18n.t("common:person", { count: 1 })).toBe("1 persona");
    expect(i18n.t("common:person", { count: 3 })).toBe("3 personas");
    await i18n.changeLanguage("en");
    expect(i18n.t("common:person", { count: 1 })).toBe("1 person");
    expect(i18n.t("common:person", { count: 3 })).toBe("3 people");
  });

  it("clave faltante en inglés cae al español", async () => {
    // 'group:currencyLocked' existe en ambos; forzamos el fallback quitando
    // temporalmente la clave del bundle inglés.
    const removed = i18n.getResource("en", "group", "creating");
    i18n.removeResourceBundle("en", "group");
    i18n.addResourceBundle("en", "group", { creating: removed }, true, true);
    await i18n.changeLanguage("en");
    // 'newTitle' ya no está en 'en' -> usa el español
    expect(i18n.t("group:newTitle")).toBe("Nuevo grupo");
  });

  it("clave inexistente en ambos devuelve la clave (no vacío)", () => {
    // i18next devuelve la clave sin el prefijo de namespace, nunca "" ni null.
    expect(i18n.t("common:no_existe_esta_clave")).toBe("no_existe_esta_clave");
  });

  it("no hay claves de nivel superior distintas entre es y en", async () => {
    const esMod = (await import("@/i18n/locales/es.json")).default;
    const enMod = (await import("@/i18n/locales/en.json")).default;
    expect(Object.keys(enMod).sort()).toEqual(Object.keys(esMod).sort());
  });
});

describe("detectInitialLang", () => {
  it("prioriza la preferencia guardada", () => {
    vi.stubGlobal("window", {
      localStorage: { getItem: () => "en" },
    });
    vi.stubGlobal("navigator", { language: "es-AR" });
    expect(detectInitialLang()).toBe("en");
  });

  it("si no hay preferencia, usa el idioma del navegador", () => {
    vi.stubGlobal("window", {
      localStorage: { getItem: () => null },
    });
    vi.stubGlobal("navigator", { language: "en-GB" });
    expect(detectInitialLang()).toBe("en");
  });

  it("cae en español por defecto", () => {
    vi.stubGlobal("window", {
      localStorage: { getItem: () => null },
    });
    vi.stubGlobal("navigator", { language: "pt-BR" });
    expect(detectInitialLang()).toBe("es");
  });

  it("no rompe si localStorage lanza", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
      },
    });
    vi.stubGlobal("navigator", { language: "fr-FR" });
    expect(detectInitialLang()).toBe("es");
  });
});
