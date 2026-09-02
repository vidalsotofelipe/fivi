import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { FiviDatabase } from "@/data/db";
import { newId } from "@/data/ids";
import * as groupRepo from "@/data/repositories/groupRepo";
import * as participantRepo from "@/data/repositories/participantRepo";
import { autoLinkMe, ensureMeInGroup, sameName } from "@/data/identity";
import { meKey, setMyName } from "@/data/settings";

let db: FiviDatabase;

beforeEach(async () => {
  db = new FiviDatabase(`fivi-identity-${newId()}`);
  await db.open();
});

const meOf = async (gid: string) =>
  (await db.settings.get(meKey(gid)))?.value ?? null;

describe("sameName", () => {
  it("ignora acentos, mayúsculas y espacios de más", () => {
    expect(sameName("Felipe", "felipe")).toBe(true);
    expect(sameName("  José  ", "jose")).toBe(true);
    expect(sameName("Ana María", "ana  maria")).toBe(true);
  });

  it("no confunde personas distintas", () => {
    expect(sameName("Ana", "Ana María")).toBe(false);
    expect(sameName("Cami", "Camila")).toBe(false);
  });
});

describe("ensureMeInGroup", () => {
  it("sin nombre configurado no hace nada", async () => {
    const g = await groupRepo.createGroup({ name: "G", currency_code: "ARS" }, db);
    expect(await ensureMeInGroup(g.id, { create: true }, db)).toBeNull();
    expect(await meOf(g.id)).toBeNull();
  });

  it("con create: se agrega como participante y queda marcado como 'yo'", async () => {
    await setMyName("Felipe", db);
    const g = await groupRepo.createGroup({ name: "G", currency_code: "ARS" }, db);

    const id = await ensureMeInGroup(g.id, { create: true }, db);
    expect(id).not.toBeNull();
    expect(await meOf(g.id)).toBe(id);

    const parts = await participantRepo.listParticipants(g.id, db);
    expect(parts.map((p) => p.name)).toEqual(["Felipe"]);
  });

  it("NO duplica si ya hay un participante con ese nombre", async () => {
    await setMyName("Felipe", db);
    const g = await groupRepo.createGroup({ name: "G", currency_code: "ARS" }, db);
    const existing = await participantRepo.addParticipant(g.id, "felipe", db);

    const id = await ensureMeInGroup(g.id, { create: true }, db);
    expect(id).toBe(existing.id);
    expect(await participantRepo.listParticipants(g.id, db)).toHaveLength(1);
  });

  it("sin create: enlaza si existe, pero no crea", async () => {
    await setMyName("Felipe", db);
    const g = await groupRepo.createGroup({ name: "G", currency_code: "ARS" }, db);

    expect(await ensureMeInGroup(g.id, {}, db)).toBeNull();
    expect(await participantRepo.listParticipants(g.id, db)).toHaveLength(0);

    const p = await participantRepo.addParticipant(g.id, "Felipe", db);
    expect(await ensureMeInGroup(g.id, {}, db)).toBe(p.id);
  });
});

describe("autoLinkMe", () => {
  it("reconoce al usuario en los grupos donde hay un participante con su nombre", async () => {
    await setMyName("Felipe", db);
    const a = await groupRepo.createGroup({ name: "A", currency_code: "ARS" }, db);
    const b = await groupRepo.createGroup({ name: "B", currency_code: "ARS" }, db);
    const c = await groupRepo.createGroup({ name: "C", currency_code: "ARS" }, db);

    const pa = await participantRepo.addParticipant(a.id, "Felipe", db);
    await participantRepo.addParticipant(b.id, "Cami", db); // no está
    await participantRepo.addParticipant(c.id, "FELIPE", db);

    const linked = await autoLinkMe(db);
    expect(linked.sort()).toEqual([a.id, c.id].sort());
    expect(await meOf(a.id)).toBe(pa.id);
    expect(await meOf(b.id)).toBeNull();
  });

  it("respeta una elección previa (no la pisa)", async () => {
    await setMyName("Felipe", db);
    const g = await groupRepo.createGroup({ name: "G", currency_code: "ARS" }, db);
    const otro = await participantRepo.addParticipant(g.id, "Cami", db);
    await participantRepo.addParticipant(g.id, "Felipe", db);
    await db.settings.put({ key: meKey(g.id), value: otro.id });

    expect(await autoLinkMe(db)).toEqual([]);
    expect(await meOf(g.id)).toBe(otro.id); // sigue siendo el que eligió
  });

  it("no crea participantes ni toca grupos borrados", async () => {
    await setMyName("Felipe", db);
    const g = await groupRepo.createGroup({ name: "G", currency_code: "ARS" }, db);
    await groupRepo.deleteGroup(g.id, db);

    expect(await autoLinkMe(db)).toEqual([]);
    expect(await participantRepo.listParticipants(g.id, db)).toHaveLength(0);
  });
});
