import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COUNTRY_CURRENCY,
  currencyForCountry,
  DEFAULT_CURRENCY,
} from "@/domain/countryCurrency";
import {
  detectInitialCurrency,
  isSupportedCurrency,
  localeRegionCurrency,
} from "@/lib/detectCurrency";

function stubEnv({
  lang = "es-AR",
  online = true,
}: { lang?: string; online?: boolean } = {}) {
  vi.stubGlobal("navigator", { language: lang, onLine: online });
}

function stubGeo(country: string | null | "reject") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      if (country === "reject") throw new Error("network");
      return { ok: true, json: async () => ({ country }) } as Response;
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("currencyForCountry", () => {
  it("mapea los países pedidos", () => {
    expect(currencyForCountry("AR")).toBe("ARS");
    expect(currencyForCountry("BR")).toBe("BRL");
    expect(currencyForCountry("CL")).toBe("CLP");
    expect(currencyForCountry("GT")).toBe("GTQ");
    expect(currencyForCountry("MX")).toBe("MXN");
    expect(currencyForCountry("US")).toBe("USD");
    expect(currencyForCountry("GB")).toBe("GBP");
    expect(currencyForCountry("JP")).toBe("JPY");
  });

  it("toda la zona euro cae en EUR", () => {
    for (const c of ["DE", "FR", "ES", "IT", "PT", "IE", "NL", "AT"]) {
      expect(currencyForCountry(c)).toBe("EUR");
    }
  });

  it("es tolerante a mayúsculas/minúsculas y espacios", () => {
    expect(currencyForCountry(" ar ")).toBe("ARS");
    expect(currencyForCountry("gt")).toBe("GTQ");
  });

  it("país desconocido o vacío → null", () => {
    expect(currencyForCountry("CA")).toBeNull();
    expect(currencyForCountry("")).toBeNull();
    expect(currencyForCountry(null)).toBeNull();
    expect(currencyForCountry(undefined)).toBeNull();
  });

  it("el mapa incluye GTQ para Guatemala", () => {
    expect(COUNTRY_CURRENCY.GT).toBe("GTQ");
  });
});

describe("localeRegionCurrency", () => {
  it("deriva la moneda de la región del navegador", () => {
    stubEnv({ lang: "es-AR" });
    expect(localeRegionCurrency()).toBe("ARS");
    stubEnv({ lang: "es-GT" });
    expect(localeRegionCurrency()).toBe("GTQ");
    stubEnv({ lang: "de-DE" });
    expect(localeRegionCurrency()).toBe("EUR");
  });

  it("región sin moneda soportada → null", () => {
    stubEnv({ lang: "en-CA" });
    expect(localeRegionCurrency()).toBeNull();
  });
});

describe("detectInitialCurrency", () => {
  it("online: usa el país de Vercel (Argentina → ARS)", async () => {
    stubEnv();
    stubGeo("AR");
    await expect(detectInitialCurrency()).resolves.toEqual({
      code: "ARS",
      source: "geo",
    });
  });

  it("online: Guatemala → GTQ", async () => {
    stubEnv({ lang: "en-US" });
    stubGeo("GT");
    await expect(detectInitialCurrency()).resolves.toEqual({
      code: "GTQ",
      source: "geo",
    });
  });

  it("online: país de la zona euro → EUR", async () => {
    stubEnv({ lang: "en-US" });
    stubGeo("FR");
    await expect(detectInitialCurrency()).resolves.toEqual({
      code: "EUR",
      source: "geo",
    });
  });

  it("online: sin país de Vercel, cae en la región del navegador", async () => {
    stubEnv({ lang: "es-CL" });
    stubGeo(null);
    await expect(detectInitialCurrency()).resolves.toEqual({
      code: "CLP",
      source: "locale",
    });
  });

  it("falla la geolocalización y la región no mapea → USD", async () => {
    stubEnv({ lang: "en-CA" });
    stubGeo("reject");
    await expect(detectInitialCurrency()).resolves.toEqual({
      code: DEFAULT_CURRENCY,
      source: "default",
    });
  });

  it("offline: usa la última moneda elegida a mano", async () => {
    stubEnv({ lang: "es-AR", online: false });
    await expect(detectInitialCurrency("MXN")).resolves.toEqual({
      code: "MXN",
      source: "last",
    });
  });

  it("offline sin última moneda: región del navegador", async () => {
    stubEnv({ lang: "es-CL", online: false });
    await expect(detectInitialCurrency()).resolves.toEqual({
      code: "CLP",
      source: "locale",
    });
  });

  it("offline sin nada útil → USD", async () => {
    stubEnv({ lang: "en-CA", online: false });
    await expect(detectInitialCurrency("ZZZ")).resolves.toEqual({
      code: "USD",
      source: "default",
    });
  });
});

describe("isSupportedCurrency", () => {
  it("reconoce el catálogo (incl. GTQ) y rechaza lo demás", () => {
    expect(isSupportedCurrency("ARS")).toBe(true);
    expect(isSupportedCurrency("GTQ")).toBe(true);
    expect(isSupportedCurrency("USD")).toBe(true);
    expect(isSupportedCurrency("ZZZ")).toBe(false);
    expect(isSupportedCurrency(null)).toBe(false);
  });
});
