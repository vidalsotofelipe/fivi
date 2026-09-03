import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { FiviDatabase } from "@/data/db";
import { newId } from "@/data/ids";
import * as groupRepo from "@/data/repositories/groupRepo";
import * as participantRepo from "@/data/repositories/participantRepo";
import * as expenseRepo from "@/data/repositories/expenseRepo";
import * as paymentRepo from "@/data/repositories/paymentRepo";
import { getGroupActivity } from "@/data/queries";

let db: FiviDatabase;

beforeEach(async () => {
  db = new FiviDatabase(`fivi-test-${newId()}`);
  await db.open();
});

describe("getGroupActivity", () => {
  it("deriva eventos de gastos, pagos y personas, ordenados por fecha desc", async () => {
    const g = await groupRepo.createGroup(
      { name: "Viaje", currency_code: "ARS" },
      db,
    );
    const ana = await participantRepo.addParticipant(g.id, "Ana", db);
    const beto = await participantRepo.addParticipant(g.id, "Beto", db);
    const { expense } = await expenseRepo.createExpense(
      {
        group_id: g.id,
        description: "Cena",
        amount_minor_units: 20000,
        paid_by: ana.id,
        participant_ids: [ana.id, beto.id],
      },
      db,
    );
    await paymentRepo.createPayment(
      {
        group_id: g.id,
        from_participant: beto.id,
        to_participant: ana.id,
        amount_minor_units: 10000,
        payment_date: "2026-08-31",
      },
      db,
    );

    const events = await getGroupActivity(g.id, db);

    // 2 personas + 1 gasto creado + 1 pago = 4 eventos
    expect(events).toHaveLength(4);
    expect(events.map((e) => e.kind).sort()).toEqual([
      "expense_created",
      "payment_created",
      "person_added",
      "person_added",
    ]);
    // orden descendente por timestamp
    for (let i = 1; i < events.length; i++) {
      expect(events[i - 1]!.at >= events[i]!.at).toBe(true);
    }
    const created = events.find((e) => e.kind === "expense_created")!;
    expect(created.name).toBe("Cena");
    expect(created.expense_id).toBe(expense.id);
    expect(created.amount_minor).toBe(20000);
    expect(created.people).toContain(ana.id);
  });

  it("marca el gasto editado (version > 1) y no lista tombstones de pago", async () => {
    const g = await groupRepo.createGroup(
      { name: "G", currency_code: "ARS" },
      db,
    );
    const ana = await participantRepo.addParticipant(g.id, "Ana", db);
    const beto = await participantRepo.addParticipant(g.id, "Beto", db);
    const { expense } = await expenseRepo.createExpense(
      {
        group_id: g.id,
        description: "Nafta",
        amount_minor_units: 5000,
        paid_by: ana.id,
        participant_ids: [ana.id, beto.id],
      },
      db,
    );
    await expenseRepo.updateExpenseMeta(
      expense.id,
      { description: "Nafta ruta 40" },
      db,
    );

    const pay = await paymentRepo.createPayment(
      {
        group_id: g.id,
        from_participant: beto.id,
        to_participant: ana.id,
        amount_minor_units: 2500,
        payment_date: "2026-08-30",
      },
      db,
    );
    await paymentRepo.deletePayment(pay.id, db);

    const events = await getGroupActivity(g.id, db);
    const kinds = events.map((e) => e.kind);
    expect(kinds).toContain("expense_created");
    expect(kinds).toContain("expense_updated");
    // el pago borrado no aparece
    expect(kinds).not.toContain("payment_created");
    const updated = events.find((e) => e.kind === "expense_updated")!;
    expect(updated.name).toBe("Nafta ruta 40");
  });

  it("el autor del gasto es quien lo REGISTRÓ (created_by), no quien pagó", async () => {
    const g = await groupRepo.createGroup(
      { name: "Asado", currency_code: "ARS" },
      db,
    );
    const ana = await participantRepo.addParticipant(g.id, "Ana", db);
    const qa = await participantRepo.addParticipant(g.id, "Usuario QA", db);
    await expenseRepo.createExpense(
      {
        group_id: g.id,
        description: "Carne",
        amount_minor_units: 120050,
        paid_by: ana.id,
        created_by: qa.id,
        participant_ids: [ana.id, qa.id],
      },
      db,
    );

    const events = await getGroupActivity(g.id, db);
    const created = events.find((e) => e.kind === "expense_created")!;
    expect(created.actor_id).toBe(qa.id);
    // el filtro por persona debe encontrar tanto al que registró como al pagador
    expect(created.people).toEqual(expect.arrayContaining([qa.id, ana.id]));
  });

  it("los gastos sin created_by siguen mostrando a quien pagó (compatibilidad)", async () => {
    const g = await groupRepo.createGroup(
      { name: "G", currency_code: "ARS" },
      db,
    );
    const ana = await participantRepo.addParticipant(g.id, "Ana", db);
    const beto = await participantRepo.addParticipant(g.id, "Beto", db);
    await expenseRepo.createExpense(
      {
        group_id: g.id,
        description: "Cena",
        amount_minor_units: 20000,
        paid_by: ana.id,
        participant_ids: [ana.id, beto.id],
      },
      db,
    );
    const events = await getGroupActivity(g.id, db);
    const created = events.find((e) => e.kind === "expense_created")!;
    expect(created.actor_id).toBe(ana.id);
    expect(created.people).toEqual([ana.id]);
  });

  it("un grupo sin movimientos ni personas no tiene eventos", async () => {
    const g = await groupRepo.createGroup(
      { name: "Vacío", currency_code: "ARS" },
      db,
    );
    expect(await getGroupActivity(g.id, db)).toEqual([]);
  });
});
