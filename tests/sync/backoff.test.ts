import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FiviDatabase } from "@/data/db";
import { newId } from "@/data/ids";
import * as groupRepo from "@/data/repositories/groupRepo";
import {
  BASE_DELAY_MS,
  MAX_ATTEMPTS,
  MAX_DELAY_MS,
  backoffDelayMs,
  getPendingItems,
  getQueueStats,
  markStatus,
} from "@/sync/queue";
import { SyncEngine } from "@/sync/SyncEngine";
import type { RemotePort } from "@/sync/RemotePort";

let db: FiviDatabase;

beforeEach(async () => {
  db = new FiviDatabase(`fivi-backoff-${newId()}`);
  await db.open();
});

describe("backoffDelayMs", () => {
  it("crece exponencialmente (mitad fija con random=0)", () => {
    const zero = () => 0;
    expect(backoffDelayMs(1, zero)).toBe(BASE_DELAY_MS / 2); // 1000
    expect(backoffDelayMs(2, zero)).toBe(BASE_DELAY_MS); // 2000
    expect(backoffDelayMs(3, zero)).toBe(BASE_DELAY_MS * 2); // 4000
    expect(backoffDelayMs(4, zero)).toBe(BASE_DELAY_MS * 4); // 8000
    expect(backoffDelayMs(5, zero)).toBe(BASE_DELAY_MS * 8); // 16000
  });

  it("aplica jitter en la mitad superior del intervalo", () => {
    const d1 = backoffDelayMs(3, () => 0);
    const d2 = backoffDelayMs(3, () => 0.999);
    expect(d1).toBe(4000);
    expect(d2).toBeGreaterThan(d1);
    expect(d2).toBeLessThanOrEqual(8000);
  });

  it("respeta el techo MAX_DELAY_MS", () => {
    expect(backoffDelayMs(50, () => 1)).toBeLessThanOrEqual(MAX_DELAY_MS);
    expect(backoffDelayMs(50, () => 0)).toBe(MAX_DELAY_MS / 2);
  });
});

describe("markStatus + getPendingItems: ventana de reintento", () => {
  async function enqueueOne() {
    await groupRepo.createGroup({ name: "G", currency_code: "ARS" }, db);
    const [item] = await getPendingItems(db);
    return item!;
  }

  it("un item en error no se reintenta hasta que vence next_attempt_at", async () => {
    const t0 = Date.parse("2026-01-01T00:00:00.000Z");
    const item = await enqueueOne();

    await markStatus([item.id], "error", db, {
      now: t0,
      random: () => 0,
      error: "boom",
    });

    const row = await db.sync_queue.get(item.id);
    expect(row?.attempts).toBe(1);
    expect(row?.error).toBe("boom");
    // next_attempt_at = t0 + 1000ms
    expect(row?.next_attempt_at).toBe(new Date(t0 + 1000).toISOString());

    // 999ms después: todavía no elegible
    expect(await getPendingItems(db, { now: t0 + 999 })).toHaveLength(0);
    // 1000ms después: elegible
    const due = await getPendingItems(db, { now: t0 + 1000 });
    expect(due.map((i) => i.id)).toEqual([item.id]);
  });

  it("tras MAX_ATTEMPTS el item queda 'agotado' y no se reintenta más", async () => {
    const item = await enqueueOne();
    let t = Date.parse("2026-01-01T00:00:00.000Z");

    for (let n = 0; n < MAX_ATTEMPTS; n++) {
      await markStatus([item.id], "error", db, { now: t, random: () => 0 });
      t += MAX_DELAY_MS; // avanzar mucho para que la ventana no sea el motivo
    }

    const row = await db.sync_queue.get(item.id);
    expect(row?.attempts).toBe(MAX_ATTEMPTS);
    expect(row?.sync_status).toBe("error");
    expect(row?.next_attempt_at).toBeNull();

    // aunque haya pasado toda la eternidad, no vuelve a getPendingItems
    expect(
      await getPendingItems(db, { now: t + 10 * MAX_DELAY_MS }),
    ).toHaveLength(0);

    const stats = await getQueueStats(db);
    expect(stats).toMatchObject({ pending: 0, exhausted: 1 });
  });

  it("un item fallido no bloquea a los demás", async () => {
    const bad = await enqueueOne();
    await groupRepo.createGroup({ name: "H", currency_code: "USD" }, db);

    const t0 = Date.parse("2026-01-01T00:00:00.000Z");
    await markStatus([bad.id], "error", db, { now: t0, random: () => 0 });

    // en la misma ventana (bad todavía en backoff) el otro item sigue disponible
    const due = await getPendingItems(db, { now: t0 + 10 });
    expect(due.map((i) => i.id)).not.toContain(bad.id);
    expect(due).toHaveLength(1);
  });

  it("volver a 'pending' o 'synced' limpia el backoff y el error", async () => {
    const item = await enqueueOne();
    const t0 = Date.parse("2026-01-01T00:00:00.000Z");
    await markStatus([item.id], "error", db, { now: t0, error: "x" });
    await markStatus([item.id], "pending", db, { now: t0 });
    const row = await db.sync_queue.get(item.id);
    expect(row?.error).toBeNull();
    expect(row?.next_attempt_at).toBeNull();
  });
});

describe("SyncEngine: backoff a nivel corrida", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("tras una falla total no reintenta hasta pasar el backoff (pero sí con force)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    await groupRepo.createGroup({ name: "G", currency_code: "ARS" }, db);

    let pushCalls = 0;
    const remote: RemotePort = {
      push: async () => {
        pushCalls++;
        throw new Error("network down");
      },
      pull: async () => [],
    };
    const engine = new SyncEngine({ remote, database: db, pollIntervalMs: 0 });

    const s1 = await engine.syncNow(true);
    expect(pushCalls).toBe(1);
    expect(s1.last_error).toContain("network down");
    // falla de transporte: el item vuelve a 'pending' sin gastar attempts
    // (no se "agota" por una caída de red); no queda en 'syncing'.
    const [row] = await db.sync_queue.toArray();
    expect(row?.sync_status).toBe("pending");
    expect(row?.attempts).toBe(0);

    // corrida NO forzada dentro de la ventana de backoff de corrida: no pushea
    await engine.syncNow();
    expect(pushCalls).toBe(1);

    // corrida forzada: sí reintenta
    await engine.syncNow(true);
    expect(pushCalls).toBe(2);

    // pasado el backoff de corrida, una no-forzada vuelve a intentar
    vi.setSystemTime(new Date("2026-01-01T00:05:00.000Z"));
    await engine.syncNow();
    expect(pushCalls).toBe(3);

    engine.stop();
  });
});
