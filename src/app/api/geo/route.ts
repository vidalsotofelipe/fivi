import { headers } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Devuelve SÓLO el código de país (ISO 3166-1 alpha-2) que Vercel adjunta a la
 * request por su geolocalización de IP. No se lee ni se guarda la IP. En
 * desarrollo local el header no existe → `{ country: null }` y el cliente cae
 * en la región del navegador.
 */
export async function GET() {
  const h = await headers();
  const country =
    h.get("x-vercel-ip-country") ?? h.get("cf-ipcountry") ?? null;
  return NextResponse.json(
    { country: country && /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : null },
    { headers: { "cache-control": "no-store" } },
  );
}
