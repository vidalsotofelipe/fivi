import { describe, expect, it } from "vitest";
import {
  computeShares,
  splitByAmounts,
  splitByWeights,
  splitEqually,
  splitStrategyLabel,
} from "@/domain/split";

const sum = (xs: { share_minor_units: number }[]) =>
  xs.reduce((a, b) => a + b.share_minor_units, 0);

describe("splitEqually", () => {
  it("dos personas dividen un gasto por igual", () => {
    const shares = splitEqually(10000, ["a", "b"]);
    expect(shares).toEqual([
      { participant_id: "a", share_minor_units: 5000 },
      { participant_id: "b", share_minor_units: 5000 },
    ]);
  });

  it("cuatro personas: $1200,00 -> $300,00 cada una", () => {
    const shares = splitEqually(120000, ["m", "l", "a", "c"]);
    expect(sum(shares)).toBe(120000);
    for (const s of shares) expect(s.share_minor_units).toBe(30000);
  });

  it("división con redondeo: $100 entre 3 mantiene la suma exacta", () => {
    const shares = splitEqually(10000, ["p1", "p2", "p3"]);
    expect(shares.map((s) => s.share_minor_units)).toEqual([3334, 3333, 3333]);
    expect(sum(shares)).toBe(10000);
  });

  it("es determinístico: no depende del orden de entrada de los ids", () => {
    const a = splitEqually(10000, ["p3", "p1", "p2"]);
    const b = splitEqually(10000, ["p1", "p2", "p3"]);
    expect(a).toEqual(b);
  });

  it("rechaza lista vacía de participantes", () => {
    expect(() => splitEqually(1000, [])).toThrow();
  });
});

describe("splitByAmounts", () => {
  it("usa los montos indicados si suman el total", () => {
    const shares = splitByAmounts(10000, ["a", "b", "c"], {
      a: 5000,
      b: 3000,
      c: 2000,
    });
    expect(shares).toEqual([
      { participant_id: "a", share_minor_units: 5000 },
      { participant_id: "b", share_minor_units: 3000 },
      { participant_id: "c", share_minor_units: 2000 },
    ]);
    expect(sum(shares)).toBe(10000);
  });

  it("un participante sin monto asignado asume 0", () => {
    const shares = splitByAmounts(10000, ["a", "b"], { a: 10000 });
    expect(shares.find((s) => s.participant_id === "b")!.share_minor_units).toBe(
      0,
    );
  });

  it("rechaza si los montos no suman el total", () => {
    expect(() =>
      splitByAmounts(10000, ["a", "b"], { a: 4000, b: 4000 }),
    ).toThrow(/no suman el total/);
  });

  it("rechaza montos negativos", () => {
    expect(() =>
      splitByAmounts(10000, ["a", "b"], { a: 12000, b: -2000 }),
    ).toThrow();
  });
});

describe("splitByWeights (porcentajes y partes)", () => {
  it("porcentajes 50/50", () => {
    const shares = splitByWeights(10000, ["a", "b"], { a: 50, b: 50 });
    expect(shares.map((s) => s.share_minor_units)).toEqual([5000, 5000]);
  });

  it("porcentajes 33,33 / 33,33 / 33,34 -> suma exacta", () => {
    const shares = splitByWeights(10000, ["p1", "p2", "p3"], {
      p1: 33.33,
      p2: 33.33,
      p3: 33.34,
    });
    expect(sum(shares)).toBe(10000);
  });

  it("partes 1 / 1 / 2", () => {
    const shares = splitByWeights(10000, ["a", "b", "c"], { a: 1, b: 1, c: 2 });
    expect(shares.map((s) => s.share_minor_units)).toEqual([2500, 2500, 5000]);
  });

  it("partes iguales 1/1/1 sobre 10 -> resto mayor determinístico", () => {
    const shares = splitByWeights(10, ["a", "b", "c"], { a: 1, b: 1, c: 1 });
    expect(shares.map((s) => s.share_minor_units)).toEqual([4, 3, 3]);
    expect(sum(shares)).toBe(10);
  });

  it("es determinístico", () => {
    const w = { a: 1, b: 2, c: 3 };
    expect(splitByWeights(9999, ["a", "b", "c"], w)).toEqual(
      splitByWeights(9999, ["c", "a", "b"], w),
    );
  });

  it("rechaza si todos los pesos son cero", () => {
    expect(() =>
      splitByWeights(1000, ["a", "b"], { a: 0, b: 0 }),
    ).toThrow();
  });
});

describe("computeShares", () => {
  it("resuelve cada estrategia y siempre suma el total", () => {
    const ids = ["a", "b", "c"];
    expect(sum(computeShares(9000, ids, { kind: "equal" }))).toBe(9000);
    expect(
      sum(
        computeShares(9000, ids, {
          kind: "amount",
          amounts: { a: 3000, b: 3000, c: 3000 },
        }),
      ),
    ).toBe(9000);
    expect(
      sum(
        computeShares(9000, ids, {
          kind: "percent",
          percents: { a: 20, b: 30, c: 50 },
        }),
      ),
    ).toBe(9000);
    expect(
      sum(
        computeShares(9000, ids, {
          kind: "shares",
          shares: { a: 1, b: 1, c: 1 },
        }),
      ),
    ).toBe(9000);
  });
});

describe("splitStrategyLabel", () => {
  it("da una etiqueta legible por estrategia", () => {
    expect(splitStrategyLabel({ kind: "equal" })).toBe("Partes iguales");
    expect(splitStrategyLabel({ kind: "amount", amounts: {} })).toBe(
      "Montos personalizados",
    );
    expect(splitStrategyLabel({ kind: "percent", percents: {} })).toBe(
      "Porcentajes",
    );
    expect(splitStrategyLabel({ kind: "shares", shares: {} })).toBe("Partes");
  });
});
