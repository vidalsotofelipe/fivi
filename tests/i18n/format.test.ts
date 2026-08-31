import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatDate,
  formatMoney,
  formatNumber,
  formatRelative,
  minutesSince,
} from "@/lib/format";

afterEach(() => {
  vi.useRealTimers();
});

describe("formato localizado", () => {
  it("formatDate cambia con el idioma pero es estable dentro de cada uno", () => {
    const es = formatDate("2026-08-31", "es");
    const en = formatDate("2026-08-31", "en");
    expect(es).toContain("2026");
    expect(en).toContain("2026");
    expect(es).not.toBe(en); // "31 ago 2026" vs "Aug 31, 2026"
    expect(en.toLowerCase()).toContain("aug");
  });

  it("formatNumber usa el separador del locale", () => {
    expect(formatNumber(1234.5, "en")).toBe("1,234.5");
    expect(formatNumber(1234.5, "es")).toBe("1.234,5");
  });

  it("formatMoney localiza el formato pero NO la moneda", () => {
    const es = formatMoney(123456, "ARS", "es");
    const en = formatMoney(123456, "ARS", "en");
    // misma moneda (ARS) en ambos, distinto agrupamiento
    expect(es).not.toBe(en);
    for (const s of [es, en]) {
      expect(s).toMatch(/1[.,]234[.,]56/);
    }
    // el idioma inglés no convierte ARS a USD
    expect(en).not.toMatch(/US\$|USD\s?450/);
  });

  it("formatMoney respeta los decimales de la moneda (CLP = 0)", () => {
    expect(formatMoney(45000, "CLP", "es")).not.toMatch(/[.,]\d\d(\D|$)/);
  });

  it("minutesSince / formatRelative respecto de ahora", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T12:00:00.000Z"));
    const tenMinAgo = new Date("2026-08-31T11:50:00.000Z").toISOString();
    expect(minutesSince(tenMinAgo)).toBe(10);
    expect(formatRelative(tenMinAgo, "en")).toMatch(/10 min/);
    expect(formatRelative(tenMinAgo, "es")).toMatch(/10 min/);
    const oneDayAgo = new Date("2026-08-30T12:00:00.000Z").toISOString();
    expect(formatRelative(oneDayAgo, "es")).toMatch(/ayer/i);
  });
});
