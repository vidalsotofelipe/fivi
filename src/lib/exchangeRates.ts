/**
 * `ExchangeRateService` — cotizaciones para el **balance global** de la moneda
 * principal. SÓLO servidor (`/api/rates`): la API key —si el proveedor la
 * necesitara— nunca llega al cliente.
 *
 * Proveedor elegido: **open.er-api.com** (ExchangeRate-API, endpoint abierto).
 *  - Sin API key, CORS abierto, ~160 monedas —incluye ARS, GTQ, CLP, UYU, BRL,
 *    MXN—, actualización diaria, devuelve la fecha de la cotización.
 *  - Se prefería en principio una fuente de banco central (ECB / Frankfurter),
 *    pero el BCE sólo publica ~30 monedas y **no cubre ARS, GTQ ni CLP**, que
 *    son centrales para FIVI. Por eso se usa un proveedor de exchange rates
 *    ampliamente utilizado como base.
 *  - La interfaz `Provider` abstrae la fuente: cambiarla es tocar sólo este
 *    archivo, no la lógica del dashboard.
 *
 * Estrategia de cache (no somos trading, priorizamos confiabilidad y bajo
 * consumo):
 *  1. cache en memoria del proceso (TTL corto para picos);
 *  2. tabla `exchange_rates` en Supabase (cache tibio compartido, sobrevive a
 *     cold starts);
 *  3. llamada al proveedor;
 *  4. si el proveedor falla, se devuelve la última cotización válida marcada
 *     como `stale` (nunca se rompe el dashboard ni se ocultan los importes).
 */
import { CURRENCIES } from "@/domain/currencies";
import type { RateTable } from "@/domain/convert";
import { getAdminClient } from "@/lib/supabaseAdmin";

/** Monedas que a FIVI le interesa cotizar. */
export const FX_SYMBOLS = Object.keys(CURRENCIES);
/** Base única: mejor cobertura y una sola llamada cubre todas las conversiones. */
export const FX_BASE = "USD";
/** Cuánto vale un cache como "fresco". No hace falta más: la fuente es diaria. */
export const FX_TTL_MS = 6 * 60 * 60 * 1000;

interface ProviderResult {
  rates: Record<string, number>;
  quoted_at: string;
}
interface Provider {
  name: string;
  fetchRates(base: string): Promise<ProviderResult>;
}

const openErApi: Provider = {
  name: "open.er-api.com",
  async fetchRates(base) {
    const res = await fetch(`https://open.er-api.com/v6/latest/${base}`, {
      // El propio servicio cachea ~1 día; no forzamos revalidación agresiva.
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error(`open.er-api ${res.status}`);
    const body = (await res.json()) as {
      result?: string;
      rates?: Record<string, number>;
      time_last_update_unix?: number;
      "error-type"?: string;
    };
    if (body.result !== "success" || !body.rates) {
      throw new Error(`open.er-api: ${body["error-type"] ?? "respuesta inválida"}`);
    }
    const rates: Record<string, number> = { [base]: 1 };
    for (const sym of FX_SYMBOLS) {
      const r = body.rates[sym];
      if (typeof r === "number" && r > 0) rates[sym] = r;
    }
    const quoted_at = body.time_last_update_unix
      ? new Date(body.time_last_update_unix * 1000).toISOString()
      : new Date().toISOString();
    return { rates, quoted_at };
  },
};

const provider: Provider = openErApi;

// --- Cache en memoria del proceso ------------------------------------------
let memo: { table: RateTable; expires: number } | null = null;

// --- Cache tibio en Supabase ---------------------------------------------------
async function readWarmCache(): Promise<RateTable | null> {
  try {
    const { data, error } = await getAdminClient()
      .from("exchange_rates")
      .select("base, rates, provider, quoted_at, fetched_at")
      .eq("base", FX_BASE)
      .maybeSingle();
    if (error || !data) return null;
    return {
      base: data.base as string,
      rates: data.rates as Record<string, number>,
      provider: data.provider as string,
      quoted_at: data.quoted_at as string,
      fetched_at: data.fetched_at as string,
    };
  } catch {
    return null;
  }
}

async function writeWarmCache(table: RateTable): Promise<void> {
  try {
    await getAdminClient()
      .from("exchange_rates")
      .upsert(
        {
          base: table.base,
          rates: table.rates,
          provider: table.provider,
          quoted_at: table.quoted_at,
          fetched_at: table.fetched_at,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "base" },
      );
  } catch {
    /* el cache tibio es best-effort */
  }
}

export interface RatesResponse {
  table: RateTable;
  /** La cotización puede estar desactualizada (proveedor caído / fuera de TTL). */
  stale: boolean;
}

const isFresh = (iso: string) =>
  Date.now() - new Date(iso).getTime() < FX_TTL_MS;

/**
 * Devuelve la tabla de cotizaciones (base USD). Nunca lanza si hay cualquier
 * cache disponible: en el peor caso devuelve el último válido con `stale: true`.
 */
export async function getRateTable(): Promise<RatesResponse> {
  if (memo && memo.expires > Date.now()) return { table: memo.table, stale: false };

  const warm = await readWarmCache();
  if (warm && isFresh(warm.fetched_at)) {
    memo = { table: warm, expires: Date.now() + FX_TTL_MS };
    return { table: warm, stale: false };
  }

  try {
    const { rates, quoted_at } = await provider.fetchRates(FX_BASE);
    const table: RateTable = {
      base: FX_BASE,
      rates,
      provider: provider.name,
      quoted_at,
      fetched_at: new Date().toISOString(),
    };
    memo = { table, expires: Date.now() + FX_TTL_MS };
    void writeWarmCache(table);
    return { table, stale: false };
  } catch {
    // Proveedor caído: la última cotización válida que tengamos, marcada stale.
    const fallback = memo?.table ?? warm;
    if (fallback) return { table: fallback, stale: true };
    throw new Error("Sin cotizaciones disponibles");
  }
}

/** Para tests: limpia el cache en memoria. */
export function __resetFxMemo(): void {
  memo = null;
}
