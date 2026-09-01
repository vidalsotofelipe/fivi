import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { FiviDatabase } from "@/data/db";
import { newId, nowIso } from "@/data/ids";
import * as groupRepo from "@/data/repositories/groupRepo";
import * as participantRepo from "@/data/repositories/participantRepo";
import * as expenseRepo from "@/data/repositories/expenseRepo";
import {
  ARCHIVE_AFTER_DAYS,
  autoArchiveStaleGroups,
} from "@/data/autoArchive";

let db: FiviDatabase;

beforeEach(async () => {
  db = new FiviDatabase(`fivi-archive-${newId()}`);
  await db.open();
});

const daysAgo = (n: number) =>
  new Date(Date.now() - n * 86_400_000).toISOString();

/**
 * Marca la cola como sincronizada y corre el auto-archivado. En la app real el
 * motor de sync drena la cola; acá lo simulamos para probar el resto del guard
 * (antigüedad + saldos). Los tests de "bloquea si hay pendientes" no lo usan.
 */
async function archiveNow(database: FiviDatabase, now?: number) {
  await database.sync_queue.toCollection().modify((it) => {
    it.sync_status = "synced";
  });
  return autoArchiveStaleGroups(database, now);
}

/** Envejece un grupo: created_at y updated_at a `iso` (grupo sin tocar hace X). */
async function ageGroup(id: string, iso: string) {
  await db.groups.where("id").equals(id).modify((g) => {
    g.created_at = iso;
    g.updated_at = iso;
  });
}

describe("archiveGroup / restoreGroup", () => {
  it("archivar marca archived_at y encola un UPDATE; restaurar lo limpia", async () => {
    const g = await groupRepo.createGroup(
      { name: "G", currency_code: "ARS" },
      db,
    );
    expect(g.archived_at).toBeNull();

    const archived = await groupRepo.archiveGroup(g.id, db);
    expect(archived.archived_at).not.toBeNull();
    expect(archived.version).toBe(2);

    // deja de aparecer en la lista normal, aparece en la de archivados
    expect(await groupRepo.listGroups(db)).toHaveLength(0);
    expect(await groupRepo.listGroups(db, { onlyArchived: true })).toHaveLength(
      1,
    );
    expect(await groupRepo.listGroups(db, { includeArchived: true })).toHaveLength(
      1,
    );

    const restored = await groupRepo.restoreGroup(g.id, db);
    expect(restored.archived_at).toBeNull();
    expect(await groupRepo.listGroups(db)).toHaveLength(1);

    const ops = await db.sync_queue.toArray();
    expect(ops.filter((o) => o.entity_type === "group").length).toBe(3); // create + archive + restore
  });
});

describe("autoArchiveStaleGroups", () => {
  it("archiva un grupo sin movimientos más viejo que el umbral", async () => {
    const g = await groupRepo.createGroup(
      { name: "Viejo", currency_code: "ARS" },
      db,
    );
    await ageGroup(g.id, daysAgo(ARCHIVE_AFTER_DAYS + 1));

    const ids = await archiveNow(db);
    expect(ids).toEqual([g.id]);
    expect((await groupRepo.getGroup(g.id, db))?.archived_at).not.toBeNull();
  });

  it("NO archiva un grupo con un gasto reciente aunque el grupo sea viejo", async () => {
    const g = await groupRepo.createGroup(
      { name: "Activo", currency_code: "ARS" },
      db,
    );
    await ageGroup(g.id, daysAgo(365));
    const p = await participantRepo.addParticipant(g.id, "Ana", db);
    await expenseRepo.createExpense(
      {
        group_id: g.id,
        description: "Café",
        amount_minor_units: 500,
        paid_by: p.id,
        participant_ids: [p.id],
      },
      db,
    );

    const ids = await archiveNow(db);
    expect(ids).toEqual([]);
  });

  it("es idempotente y no toca los ya archivados ni los recién creados", async () => {
    const fresh = await groupRepo.createGroup(
      { name: "Nuevo", currency_code: "ARS" },
      db,
    );
    const old = await groupRepo.createGroup(
      { name: "Viejo", currency_code: "ARS" },
      db,
    );
    await ageGroup(old.id, daysAgo(ARCHIVE_AFTER_DAYS + 5));

    expect(await archiveNow(db)).toEqual([old.id]);
    // segunda pasada: nada nuevo
    expect(await archiveNow(db)).toEqual([]);
    expect((await groupRepo.getGroup(fresh.id, db))?.archived_at).toBeNull();
  });

  it("usa el created_at del último pago como referencia (grupo saldado)", async () => {
    const g = await groupRepo.createGroup(
      { name: "G", currency_code: "ARS" },
      db,
    );
    await ageGroup(g.id, daysAgo(200));
    const a = await participantRepo.addParticipant(g.id, "A", db);
    const b = await participantRepo.addParticipant(g.id, "B", db);
    const e = await expenseRepo.createExpense(
      {
        group_id: g.id,
        description: "x",
        amount_minor_units: 1000,
        paid_by: a.id,
        participant_ids: [a.id, b.id],
      },
      db,
    );
    await db.expenses.where("id").equals(e.expense.id).modify((row) => {
      row.created_at = daysAgo(ARCHIVE_AFTER_DAYS + 10);
    });
    const { createPayment } = await import("@/data/repositories/paymentRepo");
    const pay = await createPayment(
      {
        group_id: g.id,
        from_participant: b.id,
        to_participant: a.id,
        amount_minor_units: 500, // salda la mitad que le tocaba a B
      },
      db,
    );
    // el pago se registró hace poco (created_at = ahora) -> no se archiva
    expect(await archiveNow(db)).toEqual([]);

    // envejecemos el created_at del pago -> ahora sí (y está saldado)
    await db.payments.where("id").equals(pay.id).modify((row) => {
      row.created_at = daysAgo(ARCHIVE_AFTER_DAYS + 1);
    });
    expect(await archiveNow(db)).toEqual([g.id]);
  });

  it("NO archiva un grupo viejo si todavía hay deudas pendientes", async () => {
    const g = await groupRepo.createGroup(
      { name: "Con deuda", currency_code: "ARS" },
      db,
    );
    const a = await participantRepo.addParticipant(g.id, "A", db);
    const b = await participantRepo.addParticipant(g.id, "B", db);
    const e = await expenseRepo.createExpense(
      {
        group_id: g.id,
        description: "Cena",
        amount_minor_units: 10000,
        paid_by: a.id,
        participant_ids: [a.id, b.id],
      },
      db,
    );
    // todo viejo, pero B le debe 5000 a A
    await ageGroup(g.id, daysAgo(365));
    await db.expenses.where("id").equals(e.expense.id).modify((row) => {
      row.created_at = daysAgo(365);
    });

    expect(await archiveNow(db)).toEqual([]);

    // saldar la deuda -> ahora sí se archiva
    const { createPayment } = await import("@/data/repositories/paymentRepo");
    const pay = await createPayment(
      {
        group_id: g.id,
        from_participant: b.id,
        to_participant: a.id,
        amount_minor_units: 5000,
      },
      db,
    );
    await db.payments.where("id").equals(pay.id).modify((row) => {
      row.created_at = daysAgo(365);
    });
    expect(await archiveNow(db)).toEqual([g.id]);
  });

  it("NO archiva si el grupo tiene cambios sin sincronizar", async () => {
    const g = await groupRepo.createGroup(
      { name: "Sin sync", currency_code: "ARS" },
      db,
    );
    await ageGroup(g.id, daysAgo(ARCHIVE_AFTER_DAYS + 5));
    // La cola tiene el CREATE del grupo en 'pending' (no se llamó archiveNow).
    expect(await autoArchiveStaleGroups(db)).toEqual([]);

    // Una vez sincronizado, sí se archiva.
    await db.sync_queue.toCollection().modify((it) => {
      it.sync_status = "synced";
    });
    expect(await autoArchiveStaleGroups(db)).toEqual([g.id]);
  });

  it("respeta un now inyectado", async () => {
    const g = await groupRepo.createGroup(
      { name: "G", currency_code: "ARS" },
      db,
    );
    await ageGroup(g.id, nowIso()); // creado 'ahora'
    const future = Date.now() + (ARCHIVE_AFTER_DAYS + 2) * 86_400_000;
    expect(await archiveNow(db, future)).toEqual([g.id]);
  });
});
