import { describe, expect, it } from "vitest";
import { isSupportedCurrency, listCurrencies } from "@/domain/currencies";

describe("isSupportedCurrency", () => {
  it("acepta las monedas del catálogo (incluidas ARS, USD, EUR, GTQ)", () => {
    for (const c of ["ARS", "USD", "EUR", "GTQ"]) {
      expect(isSupportedCurrency(c), c).toBe(true);
    }
  });

  it("acepta otros códigos ISO 4217 válidos", () => {
    expect(isSupportedCurrency("CHF")).toBe(true);
    expect(isSupportedCurrency("SEK")).toBe(true);
  });

  it("rechaza inventos y formatos mal formados", () => {
    expect(isSupportedCurrency("ABC")).toBe(false);
    expect(isSupportedCurrency("ars")).toBe(false); // minúsculas
    expect(isSupportedCurrency("US")).toBe(false); // 2 letras
    expect(isSupportedCurrency("DOLAR")).toBe(false);
    expect(isSupportedCurrency("")).toBe(false);
    expect(isSupportedCurrency(null)).toBe(false);
    expect(isSupportedCurrency(undefined)).toBe(false);
  });

  it("el catálogo del selector incluye las cuatro requeridas", () => {
    const codes = listCurrencies().map((c) => c.code);
    for (const c of ["ARS", "USD", "EUR", "GTQ"]) expect(codes).toContain(c);
  });
});
