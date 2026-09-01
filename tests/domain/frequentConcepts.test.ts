import { describe, expect, it } from "vitest";
import { normalizeConcept, rankConcepts } from "@/domain/frequentConcepts";

describe("normalizeConcept", () => {
  it("baja a minúsculas, saca acentos y colapsa espacios", () => {
    expect(normalizeConcept("  Café   con   Leche ")).toBe("cafe con leche");
    expect(normalizeConcept("Café")).toBe(normalizeConcept("cafe"));
    expect(normalizeConcept("NAFTA")).toBe("nafta");
  });
});

describe("rankConcepts", () => {
  it("ordena por frecuencia y respeta minCount", () => {
    const descs = [
      "Nafta",
      "Supermercado",
      "supermercado",
      "Café",
      "Supermercado",
      "cafe",
    ];
    const r = rankConcepts(descs, { minCount: 2, limit: 6 });
    expect(r.map((c) => c.label.toLowerCase())).toEqual(["supermercado", "café"]);
    expect(r[0]).toMatchObject({ count: 3 });
    expect(r[1]).toMatchObject({ count: 2 });
    // "Nafta" aparece una sola vez -> excluido por minCount
    expect(r.find((c) => c.label.toLowerCase() === "nafta")).toBeUndefined();
  });

  it("usa la grafía de la aparición más reciente (primer índice)", () => {
    // entrada en orden fecha desc: el primero es el más reciente
    const r = rankConcepts(["Cine", "cine", "CINE"], { minCount: 2 });
    expect(r).toHaveLength(1);
    expect(r[0]!.label).toBe("Cine");
    expect(r[0]!.count).toBe(3);
  });

  it("desempata por uso más reciente", () => {
    const r = rankConcepts(["B", "A", "B", "A"], { minCount: 2, limit: 6 });
    expect(r.map((c) => c.label)).toEqual(["B", "A"]);
  });

  it("respeta el límite", () => {
    const descs = ["a", "a", "b", "b", "c", "c", "d", "d"];
    expect(rankConcepts(descs, { minCount: 2, limit: 2 })).toHaveLength(2);
  });

  it("ignora vacíos y sin datos devuelve []", () => {
    expect(rankConcepts([], {})).toEqual([]);
    expect(rankConcepts(["", "   ", ""], { minCount: 1 })).toEqual([]);
  });
});
