import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { FiviDatabase } from "@/data/db";
import { newId, nowIso } from "@/data/ids";
import * as groupRepo from "@/data/repositories/groupRepo";
import {
  applyRemoteChanges,
  shouldApply,
} from "@/sync/applyRemoteChanges";
import type { RemoteChange } from "@/sync/types";
import type { Group } from "@/domain/types";

let db: FiviDatabase;

beforeEach(async () => {
  db = new FiviDatabase(`fivi-apply-${newId()}`);
  await db.open();
});

function groupChange(g: Group): RemoteChange {
  return {
    entity_type: "group",
    entity_id: g.id,
    payload: g,
    updated_at: g.updated_at,
    version: g.version,
    deleted_at: g.deleted_at,
  };
}

describe("shouldApply (LWW)", () => {
  const base = { updated_at: "2026-08-29T12:00:00.000Z", version: 2 };

  it("aplica si no hay local", () => {
    expect(shouldApply(base, undefined)).toBe(true);
  });
  it("aplica si el remoto es más nuevo", () => {
    expect(
      shouldApply({ updated_at: "2026-08-29T12:00:01.000Z", version: 1 }, base),
    ).toBe(true);
  });
  it("descarta si el local es más nuevo", () => {
    expect(
      shouldApply({ updated_at: "2026-08-29T11:59:59.000Z", version: 9 }, base),
    ).toBe(false);
  });
  it("desempata por version cuando updated_at es igual", () => {
    expect(shouldApply({ ...base, version: 3 }, base)).toBe(true);
    expect(shouldApply({ ...base, version: 2 }, base)).toBe(false);
  });
});

describe("applyRemoteChanges", () => {
  it("inserta una entidad que no existe localmente", async () => {
    const remoteGroup: Group = {
      id: newId(),
      name: "Desde otro dispositivo",
      description: null,
      currency_code: "USD",
      created_at: nowIso(),
      updated_at: nowIso(),
      version: 1,
      deleted_at: null,
    };
    const res = await applyRemoteChanges([groupChange(remoteGroup)], db);
    expect(res).toEqual({ applied: 1, skipped: 0 });
    expect((await db.groups.get(remoteGroup.id))?.name).toBe(
      "Desde otro dispositivo",
    );
  });

  it("no re-encola en sync_queue lo que llega del servidor", async () => {
    const g = await groupRepo.createGroup(
      { name: "Local", currency_code: "ARS" },
      db,
    );
    await db.sync_queue.clear();

    const incoming: Group = {
      ...g,
      name: "Renombrado remoto",
      updated_at: "2999-01-01T00:00:00.000Z",
      version: g.version + 1,
    };
    await applyRemoteChanges([groupChange(incoming)], db);

    expect((await db.groups.get(g.id))?.name).toBe("Renombrado remoto");
    expect(await db.sync_queue.count()).toBe(0);
  });

  it("respeta el cambio local más nuevo (no lo pisa)", async () => {
    const g = await groupRepo.createGroup(
      { name: "Local nuevo", currency_code: "ARS" },
      db,
    );
    const stale: Group = {
      ...g,
      name: "Viejo del server",
      updated_at: "2000-01-01T00:00:00.000Z",
      version: 1,
    };
    const res = await applyRemoteChanges([groupChange(stale)], db);
    expect(res).toEqual({ applied: 0, skipped: 1 });
    expect((await db.groups.get(g.id))?.name).toBe("Local nuevo");
  });

  it("aplica tombstones (borrado remoto)", async () => {
    const g = await groupRepo.createGroup(
      { name: "A borrar", currency_code: "ARS" },
      db,
    );
    const tombstone: Group = {
      ...g,
      updated_at: "2999-01-01T00:00:00.000Z",
      version: g.version + 1,
      deleted_at: "2999-01-01T00:00:00.000Z",
    };
    await applyRemoteChanges([groupChange(tombstone)], db);
    expect((await db.groups.get(g.id))?.deleted_at).not.toBeNull();
    expect(await groupRepo.listGroups(db)).toHaveLength(0);
  });
});
