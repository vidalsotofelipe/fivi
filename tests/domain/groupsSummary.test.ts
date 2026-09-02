import { describe, expect, it } from "vitest";
import { groupInitials, summarizeGroups } from "@/domain/groupsSummary";

const g = (currency_code: string, my_balance_minor: number | null) => ({
  currency_code,
  my_balance_minor,
});

describe("summarizeGroups", () => {
  it("una sola moneda: separa lo que te deben de lo que debés", () => {
    const s = summarizeGroups([
      g("ARS", 60000), // te deben
      g("ARS", -20000), // debés
      g("ARS", 0), // al día
    ]);
    expect(s.totals).toEqual([
      { currency: "ARS", owed_to_me_minor: 60000, i_owe_minor: 20000 },
    ]);
    expect(s.active_groups).toBe(3);
    expect(s.all_settled).toBe(false);
  });

  it("NUNCA suma entre monedas: un total por cada una", () => {
    // FIVI no convierte divisas; 300 EUR + 60 GBP no es un número.
    const s = summarizeGroups([g("EUR", 30000), g("GBP", 6000)]);
    expect(s.totals).toHaveLength(2);
    expect(s.totals.map((t) => t.currency)).toEqual(["EUR", "GBP"]);
    expect(s.totals[0]).toMatchObject({ owed_to_me_minor: 30000, i_owe_minor: 0 });
    expect(s.totals[1]).toMatchObject({ owed_to_me_minor: 6000, i_owe_minor: 0 });
  });

  it("ordena por monto involucrado y desempata por código", () => {
    const s = summarizeGroups([
      g("USD", 100),
      g("ARS", 900000),
      g("EUR", 50000),
    ]);
    expect(s.totals.map((t) => t.currency)).toEqual(["ARS", "EUR", "USD"]);
  });

  it("los grupos sin 'quién sos' no entran en los totales, pero se cuentan", () => {
    const s = summarizeGroups([g("ARS", null), g("ARS", 5000), g("ARS", null)]);
    expect(s.groups_without_me).toBe(2);
    expect(s.active_groups).toBe(3);
    expect(s.totals).toEqual([
      { currency: "ARS", owed_to_me_minor: 5000, i_owe_minor: 0 },
    ]);
  });

  it("todo en cero: al día y sin totales que mostrar", () => {
    const s = summarizeGroups([g("ARS", 0), g("USD", 0)]);
    expect(s.totals).toEqual([]);
    expect(s.all_settled).toBe(true);
  });

  it("sin grupos", () => {
    const s = summarizeGroups([]);
    expect(s).toEqual({
      totals: [],
      active_groups: 0,
      groups_without_me: 0,
      all_settled: true,
    });
  });

  it("una moneda que se cancela sola no aparece", () => {
    // +100 y −100 en ARS: hay deuda real (a dos personas distintas), así que
    // NO se netea a cero — se muestran las dos patas.
    const s = summarizeGroups([g("ARS", 10000), g("ARS", -10000)]);
    expect(s.totals).toEqual([
      { currency: "ARS", owed_to_me_minor: 10000, i_owe_minor: 10000 },
    ]);
    expect(s.all_settled).toBe(false);
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
    expect(groupInitials("···")).toBe("··");
    expect(groupInitials("2026 viaje")).toBe("2V");
  });
});
