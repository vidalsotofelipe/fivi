import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Cache tibio (Supabase) mockeado: por defecto vacío.
const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
const upsert = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/lib/supabaseAdmin", () => ({
  getAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle }) }),
      upsert,
    }),
  }),
}));

import { __resetFxMemo, getRateTable } from "@/lib/exchangeRates";

const providerOk = () =>
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: "success",
        rates: { USD: 1, ARS: 1450, EUR: 0.92, GTQ: 7.75 },
        time_last_update_unix: 1_756_800_000,
      }),
    }),
  );

beforeEach(() => {
  __resetFxMemo();
  maybeSingle.mockResolvedValue({ data: null, error: null });
  upsert.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe("getRateTable", () => {
  it("trae del proveedor, arma la tabla base USD y persiste el cache tibio", async () => {
    providerOk();
    const { table, stale } = await getRateTable();
    expect(stale).toBe(false);
    expect(table.base).toBe("USD");
    expect(table.rates.USD).toBe(1);
    expect(table.rates.ARS).toBe(1450);
    expect(table.provider).toBe("open.er-api.com");
    expect(table.quoted_at).toBe(new Date(1_756_800_000 * 1000).toISOString());
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("segunda llamada usa el cache en memoria (no vuelve a pegarle al proveedor)", async () => {
    providerOk();
    await getRateTable();
    const fetchSpy = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchSpy.mockClear();
    const { table } = await getRateTable();
    expect(table.rates.ARS).toBe(1450);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("proveedor caído sin ningún cache: lanza", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    await expect(getRateTable()).rejects.toThrow(/cotizaciones/i);
  });

  it("proveedor caído pero hay cache tibio viejo: lo devuelve marcado stale", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        base: "USD",
        rates: { USD: 1, ARS: 1400 },
        provider: "open.er-api.com",
        quoted_at: "2026-08-01T00:00:00Z",
        fetched_at: "2026-08-01T00:00:00Z", // > 6h → no es "fresh"
      },
      error: null,
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const { table, stale } = await getRateTable();
    expect(stale).toBe(true);
    expect(table.rates.ARS).toBe(1400);
  });

  it("cache tibio fresco: se usa sin llamar al proveedor", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        base: "USD",
        rates: { USD: 1, ARS: 1460 },
        provider: "open.er-api.com",
        quoted_at: new Date().toISOString(),
        fetched_at: new Date().toISOString(),
      },
      error: null,
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { table, stale } = await getRateTable();
    expect(stale).toBe(false);
    expect(table.rates.ARS).toBe(1460);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
