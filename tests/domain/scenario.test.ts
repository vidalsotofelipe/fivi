import { describe, expect, it } from "vitest";
import { computeShares } from "@/domain/split";
import { computeBalances } from "@/domain/balances";
import { simplifyDebts } from "@/domain/settlement";

/**
 * Caso de prueba funcional obligatorio (revisión general v0.15.1).
 *
 * Grupo: Ana, Bruno, Usuario QA. Los ids se eligen para que el orden de
 * desempate por id sea Ana < Bruno < QA (así el centavo sobrante del primer
 * gasto le toca a QA, como en el enunciado).
 *
 *  1. ARS 1.200,50 pagado por Ana, partes iguales → 400,17 / 400,17 / 400,16
 *  2. ARS 1.000 pagado por QA, partes 2–1–1       → 500 / 250 / 250
 *
 * Saldos: QA recibe 349,84 · Ana recibe 300,33 · Bruno debe 650,17
 * Simplificación: Bruno → QA 349,84 · Bruno → Ana 300,33
 */
const ANA = "11111111-1111-1111-1111-111111111111";
const BRUNO = "22222222-2222-2222-2222-222222222222";
const QA = "33333333-3333-3333-3333-333333333333";

describe("escenario funcional v0.15.1 (ARS, 3 personas)", () => {
  const ids = [ANA, BRUNO, QA];

  const exp1 = 120050; // 1.200,50
  const shares1 = computeShares(exp1, ids, { kind: "equal" });

  const exp2 = 100000; // 1.000
  const shares2 = computeShares(exp2, ids, {
    kind: "shares",
    shares: { [ANA]: 2, [BRUNO]: 1, [QA]: 1 },
  });

  it("reparte el primer gasto 400,17 / 400,17 / 400,16", () => {
    const byId = Object.fromEntries(
      shares1.map((s) => [s.participant_id, s.share_minor_units]),
    );
    expect(byId[ANA]).toBe(40017);
    expect(byId[BRUNO]).toBe(40017);
    expect(byId[QA]).toBe(40016);
    expect(shares1.reduce((a, s) => a + s.share_minor_units, 0)).toBe(exp1);
  });

  it("reparte el segundo gasto 500 / 250 / 250", () => {
    const byId = Object.fromEntries(
      shares2.map((s) => [s.participant_id, s.share_minor_units]),
    );
    expect(byId[ANA]).toBe(50000);
    expect(byId[BRUNO]).toBe(25000);
    expect(byId[QA]).toBe(25000);
  });

  const balances = computeBalances({
    participant_ids: ids,
    expenses: [
      { id: "e1", paid_by: ANA, amount_minor_units: exp1 },
      { id: "e2", paid_by: QA, amount_minor_units: exp2 },
    ],
    shares: [
      ...shares1.map((s) => ({
        expense_id: "e1",
        participant_id: s.participant_id,
        share_minor_units: s.share_minor_units,
      })),
      ...shares2.map((s) => ({
        expense_id: "e2",
        participant_id: s.participant_id,
        share_minor_units: s.share_minor_units,
      })),
    ],
    payments: [],
  });

  it("los saldos finales son QA +349,84 · Ana +300,33 · Bruno -650,17", () => {
    const b = Object.fromEntries(
      balances.map((x) => [x.participant_id, x.balance_minor]),
    );
    expect(b[QA]).toBe(34984);
    expect(b[ANA]).toBe(30033);
    expect(b[BRUNO]).toBe(-65017);
    expect(balances.reduce((a, x) => a + x.balance_minor, 0)).toBe(0);
  });

  it("la simplificación es Bruno → QA 349,84 y Bruno → Ana 300,33", () => {
    const transfers = simplifyDebts(balances);
    expect(transfers).toHaveLength(2);
    for (const tr of transfers) expect(tr.from_id).toBe(BRUNO);
    const byTo = Object.fromEntries(
      transfers.map((tr) => [tr.to_id, tr.amount_minor]),
    );
    expect(byTo[QA]).toBe(34984);
    expect(byTo[ANA]).toBe(30033);
  });
});
