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

    const ids = await autoArchiveStaleGroups(db);
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

    const ids = await autoArchiveStaleGroups(db);
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

    expect(await autoArchiveStaleGroups(db)).toEqual([old.id]);
    // segunda pasada: nada nuevo
    expect(await autoArchiveStaleGroups(db)).toEqual([]);
    expect((await groupRepo.getGroup(fresh.id, db))?.archived_at).toBeNull();
  });

  it("usa el created_at del último pago como referencia", async () => {
    const g = await groupRepo.createGroup(
      { name: "G", currency_code: "ARS" },
      db,
    );
    await ageGroup(g.id, daysAgo(200));
    const a = await participantRepo.addParticipant(g.id, "A", db);
    const b = await participantRepo.addParticipant(g.id, "B", db);
    const { createPayment } = await import(
      "@/data/repositories/paymentRepo"
    );
    const pay = await createPayment(
      {
        group_id: g.id,
        from_participant: a.id,
        to_participant: b.id,
        amount_minor_units: 1000,
        payment_date: "2020-01-01",
      },
      db,
    );
    // el pago se registró hace poco (created_at = ahora) -> no se archiva
    expect(await autoArchiveStaleGroups(db)).toEqual([]);

    // envejecemos el created_at del pago -> ahora sí
    await db.payments.where("id").equals(pay.id).modify((row) => {
      row.created_at = daysAgo(ARCHIVE_AFTER_DAYS + 1);
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
    expect(await autoArchiveStaleGroups(db, future)).toEqual([g.id]);
  });
});
