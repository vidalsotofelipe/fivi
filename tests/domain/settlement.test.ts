import { describe, expect, it } from "vitest";
import { simplifyDebts } from "@/domain/settlement";
import type { ParticipantBalance } from "@/domain/types";

function bal(entries: Record<string, number>): ParticipantBalance[] {
  return Object.entries(entries).map(([participant_id, balance_minor]) => ({
    participant_id,
    paid_minor: Math.max(balance_minor, 0),
    owed_minor: Math.max(-balance_minor, 0),
    balance_minor,
  }));
}

/** Reconstruye los balances a partir de las transferencias. */
function netFromTransfers(
  transfers: { from_id: string; to_id: string; amount_minor: number }[],
): Map<string, number> {
  const net = new Map<string, number>();
  for (const t of transfers) {
    net.set(t.from_id, (net.get(t.from_id) ?? 0) - t.amount_minor);
    net.set(t.to_id, (net.get(t.to_id) ?? 0) + t.amount_minor);
  }
  return net;
}

describe("simplifyDebts", () => {
  it("caso del documento: 4 personas, 3 transferencias", () => {
    const balances = bal({ Martin: 60, Ana: 20, Lucas: -40, Carla: -40 });
    const transfers = simplifyDebts(balances);

    expect(transfers.length).toBeLessThanOrEqual(balances.length - 1);
    for (const t of transfers) expect(t.amount_minor).toBeGreaterThan(0);

    const net = netFromTransfers(transfers);
    expect(net.get("Martin")).toBe(60);
    expect(net.get("Ana")).toBe(20);
    expect(net.get("Lucas")).toBe(-40);
    expect(net.get("Carla")).toBe(-40);
  });

  it("caso simple: una sola transferencia", () => {
    const transfers = simplifyDebts(bal({ a: 40, b: -40 }));
    expect(transfers).toEqual([{ from_id: "b", to_id: "a", amount_minor: 40 }]);
  });

  it("grupo saldado: sin transferencias", () => {
    expect(simplifyDebts(bal({ a: 0, b: 0, c: 0 }))).toEqual([]);
  });

  it("es determinístico", () => {
    const balances = bal({ z: 100, y: -30, x: -70 });
    expect(simplifyDebts(balances)).toEqual(simplifyDebts(balances));
  });

  it("nunca genera más de n-1 transferencias y salda a todos", () => {
    const balances = bal({ a: 150, b: 30, c: -45, d: -60, e: -75 });
    const transfers = simplifyDebts(balances);
    expect(transfers.length).toBeLessThanOrEqual(4);
    const net = netFromTransfers(transfers);
    for (const b of balances) {
      expect(net.get(b.participant_id) ?? 0).toBe(b.balance_minor);
    }
  });
});
