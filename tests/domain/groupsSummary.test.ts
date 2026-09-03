import { describe, expect, it } from "vitest";
import {
  globalBalance,
  groupInitials,
  summarizeGroups,
} from "@/domain/groupsSummary";
import type { RateTable } from "@/domain/convert";

const g = (currency_code: string, my_balance_minor: number | null) => ({
  currency_code,
  my_balance_minor,
});

/** Tabla de cotizaciones de prueba, base USD. */
const table = (rates: Record<string, number>): RateTable => ({
  base: "USD",
  rates: { USD: 1, ...rates },
  provider: "test",
  quoted_at: "2026-09-03T00:00:00.000Z",
  fetched_at: "2026-09-03T01:00:00.000Z",
});

describe("summarizeGroups", () => {
  it("una sola moneda: separa lo que te deben de lo que debés + neto", () => {
    const s = summarizeGroups([
      g("ARS", 60000), // te deben
      g("ARS", -20000), // debés
      g("ARS", 0), // al día
    ]);
    expect(s.totals).toEqual([
      { currency: "ARS", owed_to_me_minor: 60000, i_owe_minor: 20000, net_minor: 40000 },
    ]);
    expect(s.active_groups).toBe(3);
    expect(s.all_settled).toBe(false);
  });

  it("NUNCA suma entre monedas: un total por cada una", () => {
    const s = summarizeGroups([g("EUR", 30000), g("GBP", 6000)]);
    expect(s.totals).toHaveLength(2);
    expect(s.totals.map((t) => t.currency)).toEqual(["EUR", "GBP"]);
    expect(s.totals[0]).toMatchObject({ owed_to_me_minor: 30000, i_owe_minor: 0 });
    expect(s.totals[1]).toMatchObject({ owed_to_me_minor: 6000, i_owe_minor: 0 });
  });

  it("net_minor por moneda: 'debo USD 100 en A' + 'me deben USD 20 en B' = -80", () => {
    const s = summarizeGroups([g("USD", -10000), g("USD", 2000)]);
    expect(s.totals[0]).toMatchObject({
      currency: "USD",
      owed_to_me_minor: 2000,
      i_owe_minor: 10000,
      net_minor: -8000,
    });
  });

  it("ordena por monto involucrado y desempata por código", () => {
    const s = summarizeGroups([g("USD", 100), g("ARS", 900000), g("EUR", 50000)]);
    expect(s.totals.map((t) => t.currency)).toEqual(["ARS", "EUR", "USD"]);
  });

  it("los grupos sin 'quién sos' no entran en los totales, pero se cuentan", () => {
    const s = summarizeGroups([g("ARS", null), g("ARS", 5000), g("ARS", null)]);
    expect(s.groups_without_me).toBe(2);
    expect(s.active_groups).toBe(3);
    expect(s.totals).toEqual([
      { currency: "ARS", owed_to_me_minor: 5000, i_owe_minor: 0, net_minor: 5000 },
    ]);
  });

  it("todo en cero: al día y sin totales", () => {
    const s = summarizeGroups([g("ARS", 0), g("USD", 0)]);
    expect(s.totals).toEqual([]);
    expect(s.all_settled).toBe(true);
  });

  it("sin grupos", () => {
    expect(summarizeGroups([])).toEqual({
      totals: [],
      active_groups: 0,
      groups_without_me: 0,
      all_settled: true,
    });
  });
});

describe("globalBalance — QA de moneda principal", () => {
  it("Caso 1 · sólo grupos ARS: el global es el neto ARS, sin conversión", () => {
    const s = summarizeGroups([g("ARS", 25000), g("ARS", -10000)]);
    const gb = globalBalance(s.totals, "ARS", table({ ARS: 1450 }));
    expect(gb.balance_minor).toBe(15000);
    expect(gb.converted).toEqual(["ARS"]);
    expect(gb.missing).toEqual([]);
  });

  it("Caso 2 · ARS + USD: convierte el neto USD a ARS y suma", () => {
    // Neto ARS -150,00 (= -15000 minor); neto USD -80,00 (= -8000 minor).
    const s = summarizeGroups([g("ARS", -15000), g("USD", -8000)]);
    // 1 USD = 1450 ARS  ⇒  USD -80,00 → ARS -116.000,00 (= -11.600.000 minor)
    // total = -15.000 + (-11.600.000) = -11.615.000 minor  (ARS -116.150,00)
    const gb = globalBalance(s.totals, "ARS", table({ ARS: 1450 }));
    expect(gb.balance_minor).toBe(-11615000);
    expect(new Set(gb.converted)).toEqual(new Set(["ARS", "USD"]));
    expect(gb.missing).toEqual([]);
  });

  it("Caso 3 · ARS + USD + GTQ: discrimina las tres y las convierte a ARS", () => {
    const s = summarizeGroups([
      g("ARS", 1000000), // +10.000 ARS
      g("USD", -8000), // -80 USD
      g("GTQ", 15000), // +150 GTQ
    ]);
    // 1 USD = 1450 ARS ; 1 USD = 7.75 GTQ  ⇒ 1 GTQ = 1450/7.75 ≈ 187,097 ARS
    const gb = globalBalance(s.totals, "ARS", table({ ARS: 1450, GTQ: 7.75 }));
    // ARS +10.000 ; USD -80 → -116.000 ; GTQ +150 → +150*(1450/7.75) ≈ +28.064,52
    // total ≈ 10.000 - 116.000 + 28.064,52 = -77.935,48
    expect(gb.balance_minor).toBe(
      1000000 + Math.round((-8000 / 100) * 1450 * 100) +
        Math.round((15000 / 100) * (1450 / 7.75) * 100),
    );
    expect(new Set(gb.converted)).toEqual(new Set(["ARS", "USD", "GTQ"]));
  });

  it("Caso 4 · cambiar la moneda principal NO toca los datos: sólo cambia el equivalente", () => {
    const s = summarizeGroups([g("ARS", -15000), g("USD", -8000)]);
    const before = globalBalance(s.totals, "ARS", table({ ARS: 1450 }));
    const after = globalBalance(s.totals, "USD", table({ ARS: 1450 }));
    // s.totals (los originales) no cambió
    expect(s.totals.find((t) => t.currency === "ARS")!.net_minor).toBe(-15000);
    expect(s.totals.find((t) => t.currency === "USD")!.net_minor).toBe(-8000);
    // pero el equivalente global sí
    expect(before.currency).toBe("ARS");
    expect(after.currency).toBe("USD");
    expect(before.balance_minor).not.toBe(after.balance_minor);
  });

  it("Caso 5/6 · sin tabla (API caída): sólo entra la moneda principal; el resto queda 'missing'", () => {
    const s = summarizeGroups([g("ARS", -15000), g("USD", -8000)]);
    const gb = globalBalance(s.totals, "ARS", null);
    expect(gb.balance_minor).toBe(-15000); // sólo el neto ARS
    expect(gb.converted).toEqual(["ARS"]);
    expect(gb.missing).toEqual(["USD"]);
  });

  it("Caso 6 · cotización vencida: se usa igual, marcada como stale", () => {
    const s = summarizeGroups([g("ARS", -15000), g("USD", -8000)]);
    const gb = globalBalance(s.totals, "ARS", table({ ARS: 1450 }), { stale: true });
    expect(gb.stale).toBe(true);
    expect(gb.quoted_at).toBe("2026-09-03T00:00:00.000Z");
    expect(gb.provider).toBe("test");
  });

  it("Caso 8 · debo en una moneda y me deben en otra: NO se compensan directo", () => {
    // Debés USD 100, te deben ARS 50.000. Principal = ARS.
    const s = summarizeGroups([g("USD", -10000), g("ARS", 5000000)]);
    const gb = globalBalance(s.totals, "ARS", table({ ARS: 1450 }));
    // USD -100 → ARS -145.000 ; + ARS 50.000 = ARS -95.000
    expect(gb.balance_minor).toBe(5000000 + Math.round((-10000 / 100) * 1450 * 100));
    expect(gb.balance_minor).toBe(-9500000);
  });

  it("Caso 9 · saldo neto por moneda antes de convertir", () => {
    // 3 grupos USD: +50, -30, +10  ⇒ neto USD +30
    const s = summarizeGroups([g("USD", 5000), g("USD", -3000), g("USD", 1000)]);
    expect(s.totals[0]!.net_minor).toBe(3000);
    const gb = globalBalance(s.totals, "ARS", table({ ARS: 1450 }));
    expect(gb.balance_minor).toBe(Math.round((3000 / 100) * 1450 * 100));
  });

  it("una moneda con neto 0 no aporta al global ni cuenta como missing", () => {
    const s = summarizeGroups([g("USD", 5000), g("USD", -5000)]);
    const gb = globalBalance(s.totals, "ARS", null);
    expect(gb.converted).toEqual([]);
    expect(gb.missing).toEqual([]);
    expect(gb.balance_minor).toBe(0);
  });
});

describe("groupInitials", () => {
  it("usa las iniciales de las dos primeras palabras", () => {
    expect(groupInitials("Cena Bar Nou")).toBe("CB");
    expect(groupInitials("Roadtrip Escocia")).toBe("RE");
    expect(groupInitials("Lisboa · Marzo")).toBe("LM");
  });
  it("una sola palabra: sus dos primeras letras", () => {
    expect(groupInitials("Asado")).toBe("AS");
    expect(groupInitials("A")).toBe("A");
  });
  it("tolera nombres raros", () => {
    expect(groupInitials("   ")).toBe("··");
    expect(groupInitials("2026 viaje")).toBe("2V");
  });
});
