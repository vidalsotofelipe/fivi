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

  it("un evento recién creado se muestra como 'ahora' / 'now', nunca 'hace N horas'", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T12:00:00.000Z"));
    const now = new Date().toISOString();
    const fewSecondsAgo = new Date(Date.now() - 30_000).toISOString();
    for (const iso of [now, fewSecondsAgo]) {
      expect(formatRelative(iso, "es")).toBe("ahora");
      expect(formatRelative(iso, "en")).toBe("now");
    }
    // reloj del server apenas adelantado: sigue siendo "ahora", no "en 1 min"
    const slightlyFuture = new Date(Date.now() + 20_000).toISOString();
    expect(formatRelative(slightlyFuture, "es")).toBe("ahora");
  });

  it("una fecha sola (YYYY-MM-DD) se toma como medianoche LOCAL, no UTC", () => {
    // La causa del bug 'hace 23 horas': new Date('2026-08-31') es medianoche
    // UTC; en un huso negativo eso ya es "ayer" y el diff da ~-23h. formatDate
    // y formatRelative deben tratar la fecha sola como local.
    vi.useFakeTimers();
    // 02:00 hora local del 31 (elegimos una hora en la que UTC ya cambió de día
    // sólo si el huso fuese negativo; con la fecha tratada como local, el diff
    // es de apenas 2 h y nunca cruza a "ayer").
    vi.setSystemTime(new Date(2026, 7, 31, 2, 0, 0));
    // formatDate del 31 devuelve el 31, no el 30
    expect(formatDate("2026-08-31", "es")).toMatch(/31/);
    // formatRelative de una fecha sola nunca reporta días de diferencia para
    // "hoy": a lo sumo unas horas (medianoche local -> ahora).
    const rel = formatRelative("2026-08-31", "es");
    expect(rel).not.toMatch(/d[íi]a|ayer/i);
  });

  it("formatRelative con timestamp completo es inmune al huso (usa el instante)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T12:00:00.000Z"));
    const t = new Date("2026-08-31T11:59:40.000Z").toISOString(); // 20s antes
    expect(formatRelative(t, "es")).toBe("ahora");
    expect(formatRelative(t, "en")).toBe("now");
  });
});
