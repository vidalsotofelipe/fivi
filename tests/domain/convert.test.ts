import { describe, expect, it } from "vitest";
import {
  convertMinor,
  convertWithTable,
  rateBetween,
  type RateTable,
} from "@/domain/convert";

const T: RateTable = {
  base: "USD",
  rates: { USD: 1, ARS: 1450, EUR: 0.92, GTQ: 7.75, CLP: 950, JPY: 148 },
  provider: "test",
  quoted_at: "2026-09-03T00:00:00Z",
  fetched_at: "2026-09-03T00:00:00Z",
};

describe("rateBetween", () => {
  it("misma moneda = 1", () => {
    expect(rateBetween(T, "ARS", "ARS")).toBe(1);
  });
  it("cross-rate a partir de una base cualquiera", () => {
    // 1 USD = 1450 ARS ⇒ 1 ARS = 1/1450 USD
    expect(rateBetween(T, "ARS", "USD")).toBeCloseTo(1 / 1450, 10);
    // 1 ARS → GTQ = rates[GTQ]/rates[ARS]
    expect(rateBetween(T, "ARS", "GTQ")).toBeCloseTo(7.75 / 1450, 12);
  });
  it("null si falta la cotización de alguna", () => {
    expect(rateBetween(T, "ARS", "SEK")).toBeNull();
    expect(rateBetween({ rates: { USD: 1, ARS: 0 } }, "ARS", "USD")).toBeNull();
  });
});

describe("convertMinor", () => {
  it("USD 80,00 → ARS con rate 1450 = ARS 116.000,00", () => {
    expect(convertMinor(8000, "USD", "ARS", 1450)).toBe(11600000);
  });
  it("respeta los decimales de cada moneda (CLP y JPY = 0 decimales)", () => {
    // USD 10,00 → CLP con rate 950 ⇒ CLP 9.500 (0 decimales → 9500 minor)
    expect(convertMinor(1000, "USD", "CLP", 950)).toBe(9500);
    // CLP 10.000 (=10000 minor) → USD con rate 1/950 ⇒ USD 10,53
    expect(convertMinor(10000, "CLP", "USD", 1 / 950)).toBe(1053);
  });
  it("montos negativos (saldos): conserva el signo", () => {
    expect(convertMinor(-8000, "USD", "ARS", 1450)).toBe(-11600000);
  });
  it("misma moneda: devuelve igual", () => {
    expect(convertMinor(12345, "ARS", "ARS", 1)).toBe(12345);
  });
  it("rate inválido → null (no rompe, no convierte)", () => {
    expect(convertMinor(100, "USD", "ARS", 0)).toBeNull();
    expect(convertMinor(100, "USD", "ARS", Number.NaN)).toBeNull();
    expect(convertMinor(100, "USD", "ARS", -3)).toBeNull();
  });
  it("redondea UNA vez, al final", () => {
    // 333 (USD 3,33) * 1.005 = 334,665 → redondeo final 335 (no 334,66→335 dos pasos)
    expect(convertMinor(333, "USD", "USD", 1)).toBe(333);
    expect(convertMinor(100, "USD", "EUR", 0.925)).toBe(93); // 1,00 * 0,925 = 0,925 → 93
  });
});

describe("convertWithTable", () => {
  it("ARS → GTQ vía la tabla base USD", () => {
    const direct = convertMinor(
      100000,
      "ARS",
      "GTQ",
      rateBetween(T, "ARS", "GTQ")!,
    );
    expect(convertWithTable(100000, "ARS", "GTQ", T)).toBe(direct);
  });
  it("null si la tabla no tiene alguna de las dos monedas", () => {
    expect(convertWithTable(100, "ARS", "NOK", T)).toBeNull();
  });
});
