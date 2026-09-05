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

  it("con las 4 fuentes oficiales respondiendo, sources trae las 4 marcadas oficiales", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("bna.com.ar")) {
          return {
            ok: true,
            text: async () => `
              <p>Fecha: 4/9/2026</p>
              <table class="cotizador"><tbody>
                <tr><td>Dolar U.S.A</td><td>1499.0000</td><td>1508.0000</td></tr>
              </tbody></table>`,
          };
        }
        if (url.includes("olinda.bcb.gov.br")) {
          return {
            ok: true,
            json: async () => ({
              value: [
                {
                  cotacaoCompra: 5.1247,
                  cotacaoVenda: 5.1253,
                  dataHoraCotacao: "2026-09-04 13:03:59",
                },
              ],
            }),
          };
        }
        if (url.includes("ecb.europa.eu")) {
          return {
            ok: true,
            text: async () =>
              "<Cube time='2026-09-04'><Cube currency='USD' rate='1.1622'/></Cube>",
          };
        }
        return {
          ok: true,
          json: async () => ({
            result: "success",
            rates: { USD: 1, ARS: 1450, EUR: 0.92, BRL: 5.3, GTQ: 7.75 },
            time_last_update_unix: 1_756_800_000,
          }),
        };
      }),
    );
    const { table } = await getRateTable();
    expect(table.sources!.ARS).toMatchObject({ official: true });
    expect(table.sources!.USD).toMatchObject({ official: true });
    expect(table.sources!.BRL).toMatchObject({ official: true, quoted_at: "2026-09-04" });
    expect(table.sources!.EUR).toMatchObject({ official: true, quoted_at: "2026-09-04" });
    expect(table.rates.ARS).toBeCloseTo(1503.5, 4);
    expect(table.rates.BRL).toBeCloseTo(5.125, 3);
    expect(table.rates.EUR).toBeCloseTo(1 / 1.1622, 6);
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
