import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { FiviDatabase } from "@/data/db";
import { newId } from "@/data/ids";
import * as groupRepo from "@/data/repositories/groupRepo";
import * as participantRepo from "@/data/repositories/participantRepo";
import * as expenseRepo from "@/data/repositories/expenseRepo";
import * as paymentRepo from "@/data/repositories/paymentRepo";
import { getGroupSummary, listPastEqualExpensesFor } from "@/data/queries";
import type { SyncQueueItem } from "@/sync/types";

let db: FiviDatabase;

beforeEach(async () => {
  db = new FiviDatabase(`fivi-test-${newId()}`);
  await db.open();
});

async function queue(): Promise<SyncQueueItem[]> {
  return db.sync_queue.toArray();
}

describe("groupRepo", () => {
  it("crea un grupo y encola un CREATE pendiente", async () => {
    const g = await groupRepo.createGroup(
      { name: "Viaje a Bariloche", currency_code: "ARS" },
      db,
    );
    expect(g.version).toBe(1);
    expect(g.deleted_at).toBeNull();

    const q = await queue();
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({
      operation: "CREATE",
      entity_type: "group",
      entity_id: g.id,
      sync_status: "pending",
    });
  });

  it("exige moneda obligatoria", async () => {
    await expect(
      groupRepo.createGroup({ name: "X", currency_code: "" }, db),
    ).rejects.toThrow();
  });

  it("bloquea el cambio de moneda si el grupo ya tiene movimientos", async () => {
    const g = await groupRepo.createGroup(
      { name: "G", currency_code: "ARS" },
      db,
    );
    const p1 = await participantRepo.addParticipant(g.id, "Ana", db);
    const p2 = await participantRepo.addParticipant(g.id, "Beto", db);
    await expenseRepo.createExpense(
      {
        group_id: g.id,
        description: "Cena",
        amount_minor_units: 10000,
        paid_by: p1.id,
        participant_ids: [p1.id, p2.id],
      },
      db,
    );
    await expect(
      groupRepo.changeGroupCurrency(g.id, "USD", db),
    ).rejects.toThrow(/movimientos/);
  });

  it("permite cambiar la moneda si todavía no hay movimientos", async () => {
    const g = await groupRepo.createGroup(
      { name: "G", currency_code: "ARS" },
      db,
    );
    const updated = await groupRepo.changeGroupCurrency(g.id, "USD", db);
    expect(updated.currency_code).toBe("USD");
    expect(updated.version).toBe(2);
  });

  it("rename incrementa version y encola UPDATE", async () => {
    const g = await groupRepo.createGroup(
      { name: "G", currency_code: "ARS" },
      db,
    );
    const r = await groupRepo.renameGroup(g.id, { name: "Grupo nuevo" }, db);
    expect(r.name).toBe("Grupo nuevo");
    expect(r.version).toBe(2);
    const q = await queue();
    expect(q.filter((i) => i.operation === "UPDATE")).toHaveLength(1);
  });
});

describe("participantRepo", () => {
  it("agrega participantes sólo con nombre", async () => {
    const g = await groupRepo.createGroup(
      { name: "G", currency_code: "ARS" },
      db,
    );
    await participantRepo.addParticipant(g.id, "Martín", db);
    await participantRepo.addParticipant(g.id, "Lucas", db);
    const list = await participantRepo.listParticipants(g.id, db);
    expect(list.map((p) => p.name)).toEqual(["Lucas", "Martín"]);
  });
});

describe("expenseRepo", () => {
  it("crea el gasto y sus porciones en una transacción, con la suma exacta", async () => {
    const g = await groupRepo.createGroup(
      { name: "G", currency_code: "ARS" },
      db,
    );
    const [a, b, c] = await Promise.all([
      participantRepo.addParticipant(g.id, "A", db),
      participantRepo.addParticipant(g.id, "B", db),
      participantRepo.addParticipant(g.id, "C", db),
    ]);
    const { expense, shares } = await expenseRepo.createExpense(
      {
        group_id: g.id,
        description: "Supermercado",
        amount_minor_units: 10000,
        paid_by: a.id,
        participant_ids: [a.id, b.id, c.id],
      },
      db,
    );
    expect(shares).toHaveLength(3);
    expect(shares.reduce((s, x) => s + x.share_minor_units, 0)).toBe(10000);

    const q = await queue();
    expect(q.filter((i) => i.entity_type === "expense")).toHaveLength(1);
    expect(
      q.filter((i) => i.entity_type === "expense_participant"),
    ).toHaveLength(3);
    void expense;
    void c;
  });

  it("soft delete marca deleted_at y lo saca del listado", async () => {
    const g = await groupRepo.createGroup(
      { name: "G", currency_code: "ARS" },
      db,
    );
    const a = await participantRepo.addParticipant(g.id, "A", db);
    const b = await participantRepo.addParticipant(g.id, "B", db);
    const { expense } = await expenseRepo.createExpense(
      {
        group_id: g.id,
        description: "Cena",
        amount_minor_units: 8000,
        paid_by: a.id,
        participant_ids: [a.id, b.id],
      },
      db,
    );
    await expenseRepo.deleteExpense(expense.id, db);

    const row = await db.expenses.get(expense.id);
    expect(row?.deleted_at).not.toBeNull();
    expect(await expenseRepo.listExpenses(g.id, db)).toHaveLength(0);

    const shares = await db.expense_participants
      .where("expense_id")
      .equals(expense.id)
      .toArray();
    expect(shares.every((s) => s.deleted_at !== null)).toBe(true);

    const q = await queue();
    expect(q.some((i) => i.operation === "DELETE")).toBe(true);
  });

  it("crea un gasto con división por montos y guarda las porciones exactas", async () => {
    const g = await groupRepo.createGroup(
      { name: "G", currency_code: "ARS" },
      db,
    );
    const a = await participantRepo.addParticipant(g.id, "A", db);
    const b = await participantRepo.addParticipant(g.id, "B", db);
    const { shares } = await expenseRepo.createExpense(
      {
        group_id: g.id,
        description: "Regalo",
        amount_minor_units: 10000,
        paid_by: a.id,
        participant_ids: [a.id, b.id],
        split_strategy: {
          kind: "amount",
          amounts: { [a.id]: 7000, [b.id]: 3000 },
        },
      },
      db,
    );
    const byId = Object.fromEntries(
      shares.map((s) => [s.participant_id, s.share_minor_units]),
    );
    expect(byId[a.id]).toBe(7000);
    expect(byId[b.id]).toBe(3000);
  });

  it("rechaza una división por montos que no suma el total", async () => {
    const g = await groupRepo.createGroup(
      { name: "G", currency_code: "ARS" },
      db,
    );
    const a = await participantRepo.addParticipant(g.id, "A", db);
    const b = await participantRepo.addParticipant(g.id, "B", db);
    await expect(
      expenseRepo.createExpense(
        {
          group_id: g.id,
          description: "X",
          amount_minor_units: 10000,
          paid_by: a.id,
          participant_ids: [a.id, b.id],
          split_strategy: {
            kind: "amount",
            amounts: { [a.id]: 4000, [b.id]: 4000 },
          },
        },
        db,
      ),
    ).rejects.toThrow(/no suman el total/);
  });

  it("rechaza montos no enteros o no positivos", async () => {
    const g = await groupRepo.createGroup(
      { name: "G", currency_code: "ARS" },
      db,
    );
    const a = await participantRepo.addParticipant(g.id, "A", db);
    await expect(
      expenseRepo.createExpense(
        {
          group_id: g.id,
          description: "X",
          amount_minor_units: 10.5,
          paid_by: a.id,
          participant_ids: [a.id],
        },
        db,
      ),
    ).rejects.toThrow();
  });
});

describe("paymentRepo + getGroupSummary", () => {
  it("un pago actualiza los balances del resumen", async () => {
    const g = await groupRepo.createGroup(
      { name: "Viaje", currency_code: "ARS" },
      db,
    );
    const a = await participantRepo.addParticipant(g.id, "A", db);
    const b = await participantRepo.addParticipant(g.id, "B", db);
    await expenseRepo.createExpense(
      {
        group_id: g.id,
        description: "Cena",
        amount_minor_units: 10000,
        paid_by: a.id,
        participant_ids: [a.id, b.id],
      },
      db,
    );

    let summary = await getGroupSummary(g.id, db);
    expect(summary.total_spent_minor).toBe(10000);
    expect(
      summary.balances.reduce((s, x) => s + x.balance_minor, 0),
    ).toBe(0);
    expect(summary.transfers).toEqual([
      { from_id: b.id, to_id: a.id, amount_minor: 5000 },
    ]);

    await paymentRepo.createPayment(
      {
        group_id: g.id,
        from_participant: b.id,
        to_participant: a.id,
        amount_minor_units: 5000,
      },
      db,
    );

    summary = await getGroupSummary(g.id, db);
    for (const bal of summary.balances) expect(bal.balance_minor).toBe(0);
    expect(summary.transfers).toEqual([]);
    expect(summary.recent).toHaveLength(2);
  });

  it("rechaza pagos a uno mismo", async () => {
    const g = await groupRepo.createGroup(
      { name: "G", currency_code: "ARS" },
      db,
    );
    const a = await participantRepo.addParticipant(g.id, "A", db);
    await expect(
      paymentRepo.createPayment(
        {
          group_id: g.id,
          from_participant: a.id,
          to_participant: a.id,
          amount_minor_units: 100,
        },
        db,
      ),
    ).rejects.toThrow();
  });
});

describe("sumar un participante a gastos anteriores", () => {
  async function setup() {
    const g = await groupRepo.createGroup(
      { name: "Viaje", currency_code: "ARS" },
      db,
    );
    const a = await participantRepo.addParticipant(g.id, "Ana", db);
    const b = await participantRepo.addParticipant(g.id, "Beto", db);
    // gasto equitativo entre Ana y Beto
    const { expense: equal } = await expenseRepo.createExpense(
      {
        group_id: g.id,
        description: "Cena",
        amount_minor_units: 10000,
        paid_by: a.id,
        participant_ids: [a.id, b.id],
      },
      db,
    );
    // gasto con división personalizada (montos)
    const { expense: custom } = await expenseRepo.createExpense(
      {
        group_id: g.id,
        description: "Regalo",
        amount_minor_units: 10000,
        paid_by: a.id,
        participant_ids: [a.id, b.id],
        split_strategy: { kind: "amount", amounts: { [a.id]: 6000, [b.id]: 4000 } },
      },
      db,
    );
    return { g, a, b, equal, custom };
  }

  it("lista sólo gastos equitativos donde el nuevo no está, y marca 'todo el grupo'", async () => {
    const { g, equal } = await setup();
    const c = await participantRepo.addParticipant(g.id, "Cami", db);

    const picks = await listPastEqualExpensesFor(g.id, c.id, db);
    expect(picks.map((p) => p.expense.id)).toEqual([equal.id]); // el custom no aparece
    expect(picks[0]!.includes_all_others).toBe(true);
  });

  it("recalcula el reparto del gasto elegido incluyendo al nuevo", async () => {
    const { g, a, equal } = await setup();
    const c = await participantRepo.addParticipant(g.id, "Cami", db);

    const res = await expenseRepo.addParticipantToExpenses(c.id, [equal.id], db);
    expect(res).toEqual({ updated: 1, skipped: 0 });

    const shares = await expenseRepo.getExpenseShares(equal.id, db);
    expect(shares).toHaveLength(3);
    expect(shares.reduce((s, x) => s + x.share_minor_units, 0)).toBe(10000);
    for (const s of shares) {
      // 10000 / 3 -> 3334 / 3333 / 3333
      expect([3333, 3334]).toContain(s.share_minor_units);
    }

    const summary = await getGroupSummary(g.id, db);
    const cami = summary.balances.find((x) => x.participant_id === c.id)!;
    // La cena de 10000 se reparte 3334/3333/3333 según el orden de los ids
    // (UUID aleatorios): Cami asume alguna de esas dos y su balance queda igual
    // a lo que le correspondía, porque no pagó nada.
    expect([3333, 3334]).toContain(cami.owed_minor);
    expect(cami.balance_minor).toBe(-cami.owed_minor);
    expect(cami.paid_minor).toBe(0);
    void a;
  });

  it("ignora gastos con división personalizada y los que ya lo incluyen", async () => {
    const { g, a, b, equal, custom } = await setup();
    const res = await expenseRepo.addParticipantToExpenses(
      a.id, // Ana ya está en la cena
      [equal.id, custom.id],
      db,
    );
    expect(res).toEqual({ updated: 0, skipped: 2 });
    expect(await expenseRepo.getExpenseShares(equal.id, db)).toHaveLength(2);
    void b;
  });
});
