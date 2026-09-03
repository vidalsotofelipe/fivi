import { NextResponse } from "next/server";
import { FX_BASE, getRateTable } from "@/lib/exchangeRates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cotizaciones para el balance global de la "moneda principal" (base USD).
 * Público (lo consume el dashboard de cualquier usuario) y sin secretos: sólo
 * devuelve una tabla de tipos de cambio y de dónde salió.
 *
 * El cache (memoria + Supabase + IndexedDB en el cliente) hace que el proveedor
 * externo se consulte, a lo sumo, unas pocas veces por día en total.
 */
export async function GET(): Promise<Response> {
  try {
    const { table, stale } = await getRateTable();
    return NextResponse.json(
      {
        base: table.base,
        rates: table.rates,
        provider: table.provider,
        quoted_at: table.quoted_at,
        fetched_at: table.fetched_at,
        stale,
      },
      {
        headers: {
          // El cliente igual cachea en IndexedDB; esto ayuda al CDN.
          "cache-control": "public, max-age=1800, stale-while-revalidate=86400",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Cotizaciones no disponibles", base: FX_BASE },
      { status: 503 },
    );
  }
}
