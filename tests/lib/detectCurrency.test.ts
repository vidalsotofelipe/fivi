import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COUNTRY_CURRENCY,
  currencyForCountry,
  DEFAULT_CURRENCY,
} from "@/domain/countryCurrency";
import {
  currencyForDetectedCountry,
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
  it("mapea toda América Latina", () => {
    expect(currencyForCountry("AR")).toBe("ARS");
    expect(currencyForCountry("BO")).toBe("BOB");
    expect(currencyForCountry("BR")).toBe("BRL");
    expect(currencyForCountry("CL")).toBe("CLP");
    expect(currencyForCountry("CO")).toBe("COP");
    expect(currencyForCountry("CR")).toBe("CRC");
    expect(currencyForCountry("DO")).toBe("DOP");
    expect(currencyForCountry("GT")).toBe("GTQ");
    expect(currencyForCountry("HN")).toBe("HNL");
    expect(currencyForCountry("MX")).toBe("MXN");
    expect(currencyForCountry("NI")).toBe("NIO");
    expect(currencyForCountry("PE")).toBe("PEN");
    expect(currencyForCountry("PY")).toBe("PYG");
    expect(currencyForCountry("UY")).toBe("UYU");
    expect(currencyForCountry("VE")).toBe("VES");
  });

  it("países dolarizados usan USD", () => {
    for (const c of ["US", "EC", "SV", "PA"]) {
      expect(currencyForCountry(c), c).toBe("USD");
    }
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

  it("país fuera del mapa o vacío → null", () => {
    expect(currencyForCountry("ZW")).toBeNull(); // Zimbabue: no está en el mapa
    expect(currencyForCountry("")).toBeNull();
    expect(currencyForCountry(null)).toBeNull();
    expect(currencyForCountry(undefined)).toBeNull();
  });

  it("todas las monedas del mapa están soportadas por la app", () => {
    for (const [country, code] of Object.entries(COUNTRY_CURRENCY)) {
      expect(isSupportedCurrency(code), `${country} → ${code}`).toBe(true);
    }
  });
});

describe("currencyForDetectedCountry", () => {
  it("país conocido → su moneda", () => {
    expect(currencyForDetectedCountry("PE")).toEqual({
      code: "PEN",
      source: "geo",
      country: "PE",
    });
  });

  it("país fuera del mapa → USD (no adivina con el idioma)", () => {
    expect(currencyForDetectedCountry("ZW")).toEqual({
      code: DEFAULT_CURRENCY,
      source: "country-unsupported",
      country: "ZW",
    });
  });
});

describe("detectInitialCurrency", () => {
  it("manda el país de la conexión: Argentina → ARS", async () => {
    stubEnv();
    stubGeo("AR");
    await expect(detectInitialCurrency()).resolves.toMatchObject({
      code: "ARS",
      source: "geo",
    });
  });

  it("el país gana sobre el idioma del navegador", async () => {
    // Teléfono en inglés (en-US) pero conectado desde Perú → PEN, no USD.
    stubEnv({ lang: "en-US" });
    stubGeo("PE");
    await expect(detectInitialCurrency()).resolves.toMatchObject({
      code: "PEN",
      source: "geo",
    });
  });

  it("el país gana sobre la última moneda elegida", async () => {
    stubEnv({ lang: "es-AR" });
    stubGeo("GT");
    await expect(detectInitialCurrency("ARS")).resolves.toMatchObject({
      code: "GTQ",
      source: "geo",
    });
  });

  it("país de la zona euro → EUR", async () => {
    stubEnv({ lang: "en-US" });
    stubGeo("FR");
    await expect(detectInitialCurrency()).resolves.toMatchObject({
      code: "EUR",
      source: "geo",
    });
  });

  it("país sin moneda soportada → USD (aunque el idioma sugiera otra)", async () => {
    stubEnv({ lang: "es-AR" }); // el idioma diría ARS…
    stubGeo("ZW"); // …pero nos conectamos desde Zimbabue
    await expect(detectInitialCurrency("ARS")).resolves.toMatchObject({
      code: DEFAULT_CURRENCY,
      source: "country-unsupported",
      country: "ZW",
    });
  });

  it("sin país: la última moneda elegida a mano", async () => {
    stubEnv({ lang: "es-CL" });
    stubGeo(null);
    await expect(detectInitialCurrency("MXN")).resolves.toEqual({
      code: "MXN",
      source: "last",
    });
  });

  it("sin país ni última: la región del navegador", async () => {
    stubEnv({ lang: "es-CL" });
    stubGeo(null);
    await expect(detectInitialCurrency()).resolves.toEqual({
      code: "CLP",
      source: "locale",
    });
  });

  it("falla la geolocalización y no hay nada más → USD", async () => {
    stubEnv({ lang: "sw-KE" }); // Kenia: fuera del mapa
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
    stubEnv({ lang: "sw-KE", online: false });
    await expect(detectInitialCurrency("ZZZ")).resolves.toEqual({
      code: "USD",
      source: "default",
    });
  });
});

describe("isSupportedCurrency", () => {
  it("reconoce el catálogo ampliado y rechaza inventos", () => {
    for (const c of ["ARS", "GTQ", "USD", "PEN", "COP", "PYG", "CAD"]) {
      expect(isSupportedCurrency(c), c).toBe(true);
    }
    expect(isSupportedCurrency("ZZZ")).toBe(false);
    expect(isSupportedCurrency(null)).toBe(false);
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

  it("región fuera del mapa → null", () => {
    stubEnv({ lang: "sw-KE" });
    expect(localeRegionCurrency()).toBeNull();
  });
});
