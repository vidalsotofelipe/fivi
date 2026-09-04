import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { FiviDatabase } from "@/data/db";
import { newId } from "@/data/ids";
import * as groupRepo from "@/data/repositories/groupRepo";
import * as participantRepo from "@/data/repositories/participantRepo";
import * as expenseRepo from "@/data/repositories/expenseRepo";
import { getGroupSummary, listGroupsWithTotals } from "@/data/queries";
import { autoLinkMe, ensureMeInGroup, sameName } from "@/data/identity";
import { meKey, setMyName, setSetting } from "@/data/settings";

/**
 * Varios grupos con **las mismas personas (por nombre)**.
 *
 * En FIVI un participante es un nombre dentro de UN grupo, no una cuenta: cada
 * grupo tiene sus propios ids. Estos tests fijan que eso no se mezcle nunca —
 * saldos, gastos y "quién sos" son independientes por grupo— y dejan explícito
 * el único punto donde el nombre cruza grupos: el auto-reconocimiento del
 * usuario (`my_name`).
 */
let db: FiviDatabase;

beforeEach(async () => {
  db = new FiviDatabase(`fivi-samename-${newId()}`);
  await db.open();
});

async function groupWith(name: string, people: string[], currency = "ARS") {
  const g = await groupRepo.createGroup(
    { name, currency_code: currency },
    db,
  );
  const ids: Record<string, string> = {};
  for (const p of people) {
    ids[p] = (await participantRepo.addParticipant(g.id, p, db)).id;
  }
  return { group: g, ids };
}

describe("mismos nombres en grupos distintos", () => {
  it("cada grupo tiene su propio participante aunque el nombre se repita", async () => {
    const a = await groupWith("Asado", ["Felipe", "Ana", "Bruno"]);
    const b = await groupWith("Viaje", ["Felipe", "Ana", "Cami"]);

    // Mismo nombre, ids distintos.
    expect(a.ids.Felipe).not.toBe(b.ids.Felipe);
    expect(a.ids.Ana).not.toBe(b.ids.Ana);

    // Y cada grupo sólo ve a los suyos.
    const listA = await participantRepo.listParticipants(a.group.id, db);
    const listB = await participantRepo.listParticipants(b.group.id, db);
    expect(listA.map((p) => p.name).sort()).toEqual(["Ana", "Bruno", "Felipe"]);
    expect(listB.map((p) => p.name).sort()).toEqual(["Ana", "Cami", "Felipe"]);
    expect(listA.some((p) => p.id === b.ids.Felipe)).toBe(false);
  });

  it("los saldos NO se mezclan entre grupos con las mismas personas", async () => {
    const a = await groupWith("Asado", ["Felipe", "Ana"]);
    const b = await groupWith("Viaje", ["Felipe", "Ana"]);

    // En Asado paga Felipe 100; en Viaje paga Ana 50.
    await expenseRepo.createExpense(
      {
        group_id: a.group.id,
        description: "Carne",
        amount_minor_units: 10000,
        paid_by: a.ids.Felipe!,
        participant_ids: [a.ids.Felipe!, a.ids.Ana!],
      },
      db,
    );
    await expenseRepo.createExpense(
      {
        group_id: b.group.id,
        description: "Nafta",
        amount_minor_units: 5000,
        paid_by: b.ids.Ana!,
        participant_ids: [b.ids.Felipe!, b.ids.Ana!],
      },
      db,
    );

    const sa = await getGroupSummary(a.group.id, db);
    const sb = await getGroupSummary(b.group.id, db);

    const bal = (s: typeof sa, id: string) =>
      s.balances.find((x) => x.participant_id === id)!.balance_minor;

    // Asado: Felipe +50, Ana −50.
    expect(bal(sa, a.ids.Felipe!)).toBe(5000);
    expect(bal(sa, a.ids.Ana!)).toBe(-5000);
    // Viaje: Ana +25, Felipe −25. (Signos invertidos: son personas distintas.)
    expect(bal(sb, b.ids.Ana!)).toBe(2500);
    expect(bal(sb, b.ids.Felipe!)).toBe(-2500);

    // Ningún balance de un grupo aparece en el otro.
    expect(sa.balances.map((x) => x.participant_id)).not.toContain(
      b.ids.Felipe,
    );
    expect(sb.balances.map((x) => x.participant_id)).not.toContain(
      a.ids.Felipe,
    );
  });

  it("quitar a alguien de un grupo no lo toca en el otro", async () => {
    const a = await groupWith("Asado", ["Felipe", "Ana"]);
    const b = await groupWith("Viaje", ["Felipe", "Ana"]);

    await participantRepo.removeParticipant(a.ids.Felipe!, db);

    expect(
      (await participantRepo.listParticipants(a.group.id, db)).map((p) => p.name),
    ).toEqual(["Ana"]);
    expect(
      (await participantRepo.listParticipants(b.group.id, db))
        .map((p) => p.name)
        .sort(),
    ).toEqual(["Ana", "Felipe"]);
  });

  it("un gasto sólo puede repartirse entre gente del propio grupo", async () => {
    const a = await groupWith("Asado", ["Felipe"]);
    const b = await groupWith("Viaje", ["Felipe"]);

    // Si por un bug se mezclaran ids, el saldo del grupo A incluiría a alguien
    // que no está en él. Se comprueba que el reparto sólo toca al grupo A.
    await expenseRepo.createExpense(
      {
        group_id: a.group.id,
        description: "Carne",
        amount_minor_units: 10000,
        paid_by: a.ids.Felipe!,
        participant_ids: [a.ids.Felipe!],
      },
      db,
    );
    const sb = await getGroupSummary(b.group.id, db);
    expect(sb.total_spent_minor).toBe(0);
    expect(sb.balances.every((x) => x.balance_minor === 0)).toBe(true);
  });
});

describe("'quién sos' con nombres repetidos", () => {
  it("autoLinkMe te reconoce en TODOS los grupos donde hay alguien con tu nombre", async () => {
    await setMyName("Felipe", db);
    const a = await groupWith("Asado", ["Felipe", "Ana"]);
    const b = await groupWith("Viaje", ["felipe", "Cami"]); // minúscula a propósito
    const c = await groupWith("Sin mí", ["Ana", "Bruno"]);

    const linked = await autoLinkMe(db);
    expect(linked.sort()).toEqual([a.group.id, b.group.id].sort());

    expect((await db.settings.get(meKey(a.group.id)))?.value).toBe(a.ids.Felipe);
    expect((await db.settings.get(meKey(b.group.id)))?.value).toBe(b.ids.felipe);
    expect(await db.settings.get(meKey(c.group.id))).toBeUndefined();
  });

  it("respeta una elección previa distinta aunque haya un homónimo", async () => {
    await setMyName("Felipe", db);
    const a = await groupWith("Asado", ["Felipe", "Ana"]);
    // El usuario ya dijo que en ese grupo es Ana (p. ej. el Felipe es otro).
    await setSetting(meKey(a.group.id), a.ids.Ana!, db);

    await autoLinkMe(db);
    expect((await db.settings.get(meKey(a.group.id)))?.value).toBe(a.ids.Ana);
  });

  it("ensureMeInGroup no duplica: reusa al homónimo que ya está en ESE grupo", async () => {
    await setMyName("Felipe", db);
    const a = await groupWith("Asado", ["Felipe"]);

    const id = await ensureMeInGroup(a.group.id, { create: true }, db);
    expect(id).toBe(a.ids.Felipe);
    expect(await participantRepo.listParticipants(a.group.id, db)).toHaveLength(1);
  });

  it("ensureMeInGroup crea uno nuevo por grupo, sin reusar el de otro grupo", async () => {
    await setMyName("Felipe", db);
    const a = await groupWith("Asado", ["Felipe"]);
    const b = await groupWith("Viaje", ["Ana"]);

    const idB = await ensureMeInGroup(b.group.id, { create: true }, db);
    expect(idB).not.toBe(a.ids.Felipe);
    const listB = await participantRepo.listParticipants(b.group.id, db);
    expect(listB.map((p) => p.name).sort()).toEqual(["Ana", "Felipe"]);
  });

  it("con dos homónimos en el MISMO grupo, elige uno de forma determinística", async () => {
    // La UI impide agregar dos "Felipe" en un grupo, pero pueden llegar
    // sincronizados desde otro dispositivo. No debe romper ni alternar.
    await setMyName("Felipe", db);
    const g = await groupRepo.createGroup(
      { name: "Raro", currency_code: "ARS" },
      db,
    );
    await participantRepo.addParticipant(g.id, "Felipe", db);
    await participantRepo.addParticipant(g.id, "Felipe", db);

    const first = await ensureMeInGroup(g.id, { create: false }, db);
    const second = await ensureMeInGroup(g.id, { create: false }, db);
    expect(first).not.toBeNull();
    expect(second).toBe(first);
    // No creó a nadie más.
    expect(await participantRepo.listParticipants(g.id, db)).toHaveLength(2);
  });

  it("sameName ignora acentos/caso/espacios pero no confunde nombres distintos", () => {
    expect(sameName("Felipe", "  felipe ")).toBe(true);
    expect(sameName("Martín", "Martin")).toBe(true);
    expect(sameName("Felipe", "Fel")).toBe(false);
    expect(sameName("Ana", "Ana María")).toBe(false);
  });
});

describe("resumen del inicio con nombres repetidos", () => {
  it("cada grupo aporta su propio saldo del usuario", async () => {
    await setMyName("Felipe", db);
    const a = await groupWith("Asado", ["Felipe", "Ana"]);
    const b = await groupWith("Viaje", ["Felipe", "Ana"]);
    await autoLinkMe(db);

    // Asado: Felipe paga 100 → le deben 50.
    await expenseRepo.createExpense(
      {
        group_id: a.group.id,
        description: "Carne",
        amount_minor_units: 10000,
        paid_by: a.ids.Felipe!,
        participant_ids: [a.ids.Felipe!, a.ids.Ana!],
      },
      db,
    );
    // Viaje: paga Ana 60 → Felipe debe 30.
    await expenseRepo.createExpense(
      {
        group_id: b.group.id,
        description: "Nafta",
        amount_minor_units: 6000,
        paid_by: b.ids.Ana!,
        participant_ids: [b.ids.Felipe!, b.ids.Ana!],
      },
      db,
    );

    const list = await listGroupsWithTotals(db);
    const byName = Object.fromEntries(
      list.map((g) => [g.group.name, g.my_balance_minor]),
    );
    expect(byName.Asado).toBe(5000);
    expect(byName.Viaje).toBe(-3000);
  });
});
