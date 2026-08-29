import { describe, expect, it } from "vitest";
import {
  distributeMinor,
  formatMoney,
  fromMinorUnits,
  minorFromDecimal,
  toMinorUnits,
} from "@/domain/money";

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
