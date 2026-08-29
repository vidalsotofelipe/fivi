import { describe, expect, it } from "vitest";
import {
  computeShares,
  NotImplementedError,
  splitEqually,
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

describe("computeShares", () => {
  it("resuelve la estrategia equitativa", () => {
    const shares = computeShares(9000, ["b", "c", "d"], { kind: "equal" });
    expect(sum(shares)).toBe(9000);
  });

  it("las estrategias no equitativas todavía no están implementadas", () => {
    expect(() =>
      computeShares(1000, ["a", "b"], { kind: "percent", percents: { a: 50, b: 50 } }),
    ).toThrow(NotImplementedError);
  });
});
