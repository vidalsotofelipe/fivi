/**
 * `ExchangeRateService` — cotizaciones para el **balance global** de la moneda
 * principal. SÓLO servidor (`/api/rates`): la API key —si el proveedor la
 * necesitara— nunca llega al cliente.
 *
 * Proveedor actual: **open.er-api.com** (ExchangeRate-API, endpoint abierto).
 *  - Sin API key, CORS abierto, ~160 monedas —incluye ARS, GTQ, CLP, UYU, BRL,
 *    MXN—, actualización diaria, devuelve la fecha de la cotización.
 *  - **NO es una fuente oficial** ni de banco central: es una referencia de
 *    mercado. Está marcado `official: false` y la UI lo dice con todas las
 *    letras, en vez de presentarlo como "la" cotización.
 *  - El relevamiento de qué banco central o fuente de gobierno cubre cada una de
 *    las 35 monedas soportadas está en `docs/FX_SOURCES.md`. Migrar a fuentes
 *    oficiales por moneda/región es trabajo pendiente y planificado ahí; la
 *    interfaz `Provider` existe justamente para que ese cambio no toque nada
 *    fuera de este archivo.
 *  - Regla que ya se cumple y no debe romperse: una moneda sin cotización
 *    utilizable NO se convierte ni se inventa — queda fuera del total y se
 *    lista en `missing` con su importe original (ver `domain/groupsSummary`).
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
  /**
   * `true` sólo para bancos centrales u organismos oficiales. Viaja hasta la UI:
   * define si la conversión se presenta como oficial o como estimación.
   */
  official: boolean;
  /** Página de la fuente, para poder citarla. */
  homepage: string;
  fetchRates(base: string): Promise<ProviderResult>;
}

const openErApi: Provider = {
  name: "open.er-api.com",
  official: false,
  homepage: "https://www.exchangerate-api.com",
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

/**
 * Registro de proveedores conocidos. El cache tibio de Supabase sólo guarda el
 * NOMBRE de la fuente, así que la condición de "oficial" se resuelve acá y no
 * hace falta una columna nueva ni una migración. Una fuente desconocida se trata
 * como no oficial: el default seguro es no prometer oficialidad.
 */
const PROVIDERS: Record<string, Provider> = {
  [openErApi.name]: openErApi,
};

export function isOfficialProvider(name: string | null | undefined): boolean {
  return name ? (PROVIDERS[name]?.official ?? false) : false;
}

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
      official: isOfficialProvider(data.provider as string),
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
      official: provider.official,
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
