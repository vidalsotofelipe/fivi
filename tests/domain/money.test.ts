import { describe, expect, it } from "vitest";
import {
  distributeByWeights,
  distributeMinor,
  formatMoney,
  fromMinorUnits,
  minorFromDecimal,
  minorToRawInput,
  toMinorUnits,
} from "@/domain/money";
import { getCurrencyInfo } from "@/domain/currencies";

describe("minorFromDecimal / fromMinorUnits", () => {
  it("convierte a unidades mínimas según los decimales de la moneda", () => {
    expect(minorFromDecimal(25.5, "USD")).toBe(2550);
    expect(minorFromDecimal(100, "ARS")).toBe(10000);
    expect(minorFromDecimal(12500, "CLP")).toBe(12500); // 0 decimales
  });

  it("es inverso de fromMinorUnits", () => {
    expect(fromMinorUnits(2550, "USD")).toBe(25.5);
    expect(fromMinorUnits(12500, "CLP")).toBe(12500);
  });

  it("redondea al entero más cercano", () => {
    expect(minorFromDecimal(10.01, "USD")).toBe(1001);
    expect(minorFromDecimal(10.004, "USD")).toBe(1000);
  });
});

describe("toMinorUnits (parseo de texto del usuario)", () => {
  it("parsea formato es-AR con símbolo y separadores", () => {
    expect(toMinorUnits("$ 1.234,56", "ARS")).toBe(123456);
    expect(toMinorUnits("1234,5", "ARS")).toBe(123450);
    expect(toMinorUnits("1000", "ARS")).toBe(100000);
  });

  it("parsea formato en-US para USD", () => {
    expect(toMinorUnits("1,234.56", "USD")).toBe(123456);
    expect(toMinorUnits("450", "USD")).toBe(45000);
  });

  it("respeta monedas de 0 decimales (CLP)", () => {
    expect(toMinorUnits("$ 12.500", "CLP")).toBe(12500);
    expect(toMinorUnits("12500", "CLP")).toBe(12500);
  });

  it("rechaza entradas no numéricas", () => {
    expect(() => toMinorUnits("abc", "ARS")).toThrow();
    expect(() => toMinorUnits("", "ARS")).toThrow();
  });
});

describe("minorToRawInput", () => {
  it("produce texto re-parseable con toMinorUnits en cada moneda", () => {
    for (const code of ["ARS", "USD", "EUR", "BRL", "CLP", "GBP", "GTQ"]) {
      for (const minor of [0, 5, 100, 12345, 1000000]) {
        const raw = minorToRawInput(minor, code);
        expect(toMinorUnits(raw, code)).toBe(minor);
      }
    }
  });

  it("no incluye separador de miles", () => {
    expect(minorToRawInput(123456789, "ARS")).not.toContain(".");
  });
});

describe("formatMoney", () => {
  it("formatea según moneda y locale", () => {
    expect(formatMoney(45000, "USD", "en-US")).toBe("$450.00");
    expect(formatMoney(123456, "ARS", "es-AR")).toContain("1.234,56");
  });

  it("no muestra decimales en monedas de 0 decimales", () => {
    const out = formatMoney(12500, "CLP", "es-CL");
    expect(out).toContain("12.500");
    expect(out).not.toContain(",00");
  });

  it("GTQ: quetzal guatemalteco, 2 decimales, símbolo Q", () => {
    expect(getCurrencyInfo("GTQ")).toMatchObject({
      code: "GTQ",
      decimal_digits: 2,
      locale: "es-GT",
    });
    // 123456 unidades mínimas = Q 1.234,56
    expect(toMinorUnits("Q 1,234.56", "GTQ")).toBe(123456);
    const out = formatMoney(123456, "GTQ", "es-GT");
    expect(out).toMatch(/1[.,]234[.,]56/);
    expect(out).toMatch(/Q/);
    // reparto entero exacto en GTQ
    expect(distributeMinor(10000, 3)).toEqual([3334, 3333, 3333]);
  });
});

describe("distributeMinor (reparto determinístico)", () => {
  it("$100 entre 3 -> 33,34 / 33,33 / 33,33", () => {
    expect(distributeMinor(10000, 3)).toEqual([3334, 3333, 3333]);
  });

  it("la suma es exactamente el total", () => {
    for (const total of [1, 7, 100, 9999, 10000, 123457]) {
      for (const n of [1, 2, 3, 4, 7]) {
        const parts = distributeMinor(total, n);
        expect(parts).toHaveLength(n);
        expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      }
    }
  });

  it("soporta montos negativos", () => {
    expect(distributeMinor(-100, 3)).toEqual([-34, -33, -33]);
  });

  it("valida argumentos", () => {
    expect(() => distributeMinor(10.5, 2)).toThrow();
    expect(() => distributeMinor(100, 0)).toThrow();
  });
});

describe("distributeByWeights (método del resto mayor)", () => {
  it("reparte en proporción a los pesos y suma el total", () => {
    expect(distributeByWeights(10000, [1, 1, 2])).toEqual([2500, 2500, 5000]);
    expect(distributeByWeights(10, [1, 1, 1])).toEqual([4, 3, 3]);
  });

  it("la suma es siempre exacta", () => {
    for (const total of [1, 7, 9999, 123457]) {
      for (const w of [[1, 2, 3], [10, 10, 10, 1], [33.33, 33.33, 33.34]]) {
        const parts = distributeByWeights(total, w);
        expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      }
    }
  });

  it("es determinístico ante empates de fracción", () => {
    expect(distributeByWeights(100, [1, 1, 1])).toEqual(
      distributeByWeights(100, [1, 1, 1]),
    );
  });

  it("rechaza pesos negativos o suma cero", () => {
    expect(() => distributeByWeights(100, [1, -1])).toThrow();
    expect(() => distributeByWeights(100, [0, 0])).toThrow();
  });
});
