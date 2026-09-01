import { describe, expect, it } from "vitest";
import { settleAmountError } from "@/lib/settle";

describe("settleAmountError", () => {
  it("sin monto todavía: no molesta", () => {
    expect(settleAmountError(null, 12500)).toBeNull();
  });

  it("monto <= 0 → 'positive'", () => {
    expect(settleAmountError(0, 12500)).toBe("positive");
    expect(settleAmountError(-100, 12500)).toBe("positive");
  });

  it("pago parcial válido (0 < monto <= deuda) → null", () => {
    expect(settleAmountError(5000, 12500)).toBeNull();
    expect(settleAmountError(12500, 12500)).toBeNull(); // exacto = saldar completo
  });

  it("no puede superar la deuda pendiente → 'over'", () => {
    expect(settleAmountError(12501, 12500)).toBe("over");
    expect(settleAmountError(999999, 12500)).toBe("over");
  });

  it("sin tope (pago manual, no vino de Saldar): sólo exige > 0", () => {
    expect(settleAmountError(999999, null)).toBeNull();
    expect(settleAmountError(0, null)).toBe("positive");
  });
});
