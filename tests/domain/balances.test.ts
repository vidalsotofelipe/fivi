import { describe, expect, it } from "vitest";
import {
  computeBalances,
  totalSpentMinor,
  type BalancesInput,
} from "@/domain/balances";
import { splitEqually } from "@/domain/split";

function sharesFor(expenseId: string, total: number, ids: string[]) {
  return splitEqually(total, ids).map((s) => ({
    expense_id: expenseId,
    participant_id: s.participant_id,
    share_minor_units: s.share_minor_units,
  }));
}

const zeroSum = (bs: { balance_minor: number }[]) =>
  bs.reduce((a, b) => a + b.balance_minor, 0);

describe("computeBalances", () => {
  it("quien paga también participa", () => {
    const input: BalancesInput = {
      participant_ids: ["a", "b"],
      expenses: [{ id: "e1", paid_by: "a", amount_minor_units: 10000 }],
      shares: sharesFor("e1", 10000, ["a", "b"]),
      payments: [],
    };
    const bs = computeBalances(input);
    expect(bs.find((b) => b.participant_id === "a")!.balance_minor).toBe(5000);
    expect(bs.find((b) => b.participant_id === "b")!.balance_minor).toBe(-5000);
    expect(zeroSum(bs)).toBe(0);
  });

  it("quien paga no participa del gasto", () => {
    const input: BalancesInput = {
      participant_ids: ["a", "b", "c", "d"],
      expenses: [{ id: "e1", paid_by: "a", amount_minor_units: 9000 }],
      shares: sharesFor("e1", 9000, ["b", "c", "d"]),
      payments: [],
    };
    const bs = computeBalances(input);
    expect(bs.find((b) => b.participant_id === "a")!.balance_minor).toBe(9000);
    expect(bs.find((b) => b.participant_id === "b")!.balance_minor).toBe(-3000);
    expect(zeroSum(bs)).toBe(0);
  });

  it("varios gastos se acumulan", () => {
    const input: BalancesInput = {
      participant_ids: ["a", "b", "c"],
      expenses: [
        { id: "e1", paid_by: "a", amount_minor_units: 3000 },
        { id: "e2", paid_by: "b", amount_minor_units: 6000 },
      ],
      shares: [
        ...sharesFor("e1", 3000, ["a", "b", "c"]),
        ...sharesFor("e2", 6000, ["a", "b", "c"]),
      ],
      payments: [],
    };
    const bs = computeBalances(input);
    // a puso 3000, le tocaba 3000 -> 0 ; b puso 6000, le tocaba 3000 -> +3000 ; c -> -3000
    expect(bs.find((b) => b.participant_id === "a")!.balance_minor).toBe(0);
    expect(bs.find((b) => b.participant_id === "b")!.balance_minor).toBe(3000);
    expect(bs.find((b) => b.participant_id === "c")!.balance_minor).toBe(-3000);
    expect(zeroSum(bs)).toBe(0);
  });

  it("un pago completo deja a las dos personas en cero", () => {
    const input: BalancesInput = {
      participant_ids: ["a", "b"],
      expenses: [{ id: "e1", paid_by: "a", amount_minor_units: 10000 }],
      shares: sharesFor("e1", 10000, ["a", "b"]),
      payments: [
        { from_participant: "b", to_participant: "a", amount_minor_units: 5000 },
      ],
    };
    const bs = computeBalances(input);
    expect(bs.find((b) => b.participant_id === "a")!.balance_minor).toBe(0);
    expect(bs.find((b) => b.participant_id === "b")!.balance_minor).toBe(0);
  });

  it("un pago parcial reduce la deuda proporcionalmente", () => {
    const input: BalancesInput = {
      participant_ids: ["a", "b"],
      expenses: [{ id: "e1", paid_by: "a", amount_minor_units: 10000 }],
      shares: sharesFor("e1", 10000, ["a", "b"]),
      payments: [
        { from_participant: "b", to_participant: "a", amount_minor_units: 2000 },
      ],
    };
    const bs = computeBalances(input);
    expect(bs.find((b) => b.participant_id === "a")!.balance_minor).toBe(3000);
    expect(bs.find((b) => b.participant_id === "b")!.balance_minor).toBe(-3000);
    expect(zeroSum(bs)).toBe(0);
  });

  it("participante sin movimientos queda con balance cero", () => {
    const input: BalancesInput = {
      participant_ids: ["a", "b", "z"],
      expenses: [{ id: "e1", paid_by: "a", amount_minor_units: 4000 }],
      shares: sharesFor("e1", 4000, ["a", "b"]),
      payments: [],
    };
    const bs = computeBalances(input);
    expect(bs.find((b) => b.participant_id === "z")!.balance_minor).toBe(0);
    expect(zeroSum(bs)).toBe(0);
  });

  it("la suma de balances es cero incluso con divisiones no exactas", () => {
    const input: BalancesInput = {
      participant_ids: ["a", "b", "c"],
      expenses: [{ id: "e1", paid_by: "a", amount_minor_units: 10000 }],
      shares: sharesFor("e1", 10000, ["a", "b", "c"]),
      payments: [],
    };
    const bs = computeBalances(input);
    expect(zeroSum(bs)).toBe(0);
  });
});

describe("totalSpentMinor", () => {
  it("suma sólo los gastos", () => {
    expect(
      totalSpentMinor([
        { id: "e1", paid_by: "a", amount_minor_units: 3000 },
        { id: "e2", paid_by: "b", amount_minor_units: 6000 },
      ]),
    ).toBe(9000);
  });
});
