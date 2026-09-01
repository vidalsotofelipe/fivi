import { describe, expect, it } from "vitest";
import {
  isFullySynced,
  needsAttention,
  syncStatusKind,
  type SyncStatusInput,
} from "@/sync/statusKind";

const base: SyncStatusInput = {
  backend: "cloud",
  online: true,
  syncing: false,
  pending_count: 0,
  exhausted_count: 0,
  last_error: null,
  access_error: null,
};

describe("syncStatusKind", () => {
  it("todo al día", () => {
    expect(syncStatusKind(base)).toBe("synced");
    expect(isFullySynced("synced")).toBe(true);
  });

  it("modo local gana sobre todo lo demás", () => {
    expect(
      syncStatusKind({
        ...base,
        backend: "local",
        exhausted_count: 9,
        access_error: "x",
        online: false,
      }),
    ).toBe("local");
  });

  it("sin acceso tiene prioridad sobre rechazos", () => {
    expect(
      syncStatusKind({ ...base, access_error: "denegado", exhausted_count: 5 }),
    ).toBe("no-access");
  });

  it("cambios rechazados por el servidor", () => {
    expect(syncStatusKind({ ...base, exhausted_count: 19 })).toBe("exhausted");
    expect(needsAttention("exhausted")).toBe(true);
  });

  it("un error de corrida se reporta como reintentando", () => {
    expect(syncStatusKind({ ...base, last_error: "network" })).toBe("retrying");
    expect(needsAttention("retrying")).toBe(false);
  });

  it("offline, con y sin pendientes", () => {
    expect(syncStatusKind({ ...base, online: false })).toBe("offline");
    expect(syncStatusKind({ ...base, online: false, pending_count: 3 })).toBe(
      "offline-pending",
    );
  });

  it("sincronizando y pendientes", () => {
    expect(syncStatusKind({ ...base, syncing: true })).toBe("syncing");
    expect(syncStatusKind({ ...base, pending_count: 2 })).toBe("pending");
  });

  it("REGRESIÓN: con cambios rechazados NUNCA está 'fully synced'", () => {
    // El bug: la barra decía "19 sin sincronizar" y el resumen "Sincronizado
    // recién" en la misma pantalla. `fullySynced` es lo único que habilita la
    // marca de tiempo, así que no pueden volver a contradecirse.
    const kind = syncStatusKind({ ...base, exhausted_count: 19 });
    expect(kind).toBe("exhausted");
    expect(isFullySynced(kind)).toBe(false);
  });

  it("ningún estado con pendientes o errores es 'fully synced'", () => {
    const noEstaAlDia: SyncStatusInput[] = [
      { ...base, exhausted_count: 1 },
      { ...base, last_error: "x" },
      { ...base, access_error: "x" },
      { ...base, pending_count: 1 },
      { ...base, syncing: true },
      { ...base, online: false },
    ];
    for (const s of noEstaAlDia) {
      expect(isFullySynced(syncStatusKind(s))).toBe(false);
    }
  });
});
