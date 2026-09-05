/**
 * Cotización oficial del euro del **Banco Central Europeo** (BCE) —
 * "Euro foreign exchange reference rates".
 *
 * Fuente: https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml — un
 * feed XML público, sin registro, actualizado un día hábil por vez (~16h
 * CET). Es un banco central público, así que cuenta como fuente oficial.
 *
 * El feed publica cuántos USD (y otras monedas) equivalen a 1 EUR
 * (`currency="USD" rate="1.1622"`); FIVI necesita el inverso —cuántos EUR
 * equivalen a 1 USD—, así que se invierte acá mismo.
 *
 * Igual que `bna.ts`/`bcbPtax.ts`: parser aparte para poder testearlo sin
 * red, valida el número antes de creerle, y **falla cerrado** ante cualquier
 * problema.
 */

export interface EcbQuote {
  /** Euros por 1 dólar. */
  eurPerUsd: number;
  /** Dólares por 1 euro, tal como lo publica el BCE (antes de invertir). */
  usdPerEur: number;
  /** ISO del día que publica el BCE. */
  quoted_at: string;
}

export const ECB_NAME = "Banco Central Europeo";
export const ECB_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

const FETCH_TIMEOUT_MS = 8000;

/**
 * Parsea el XML diario del BCE. Exportada aparte de `fetchEcbRates` para
 * poder testearla sin red.
 */
export function parseEcbXml(xml: string): EcbQuote | null {
  const dateMatch = /<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]/i.exec(xml);
  const quoted_at = dateMatch?.[1];
  if (!quoted_at) return null;
  if (Number.isNaN(new Date(quoted_at).getTime())) return null;

  const usdMatch = /<Cube\s+currency=['"]USD['"]\s+rate=['"]([\d.]+)['"]/i.exec(xml);
  if (!usdMatch) return null;

  const usdPerEur = Number(usdMatch[1]);
  if (!Number.isFinite(usdPerEur) || usdPerEur <= 0) return null;
  // Banda de sanidad amplia: EUR/USD se movió históricamente entre 0,5 y 3.
  // Sólo descarta lecturas absurdas (celda equivocada, forma distinta).
  if (usdPerEur < 0.5 || usdPerEur > 3) return null;

  return { usdPerEur, eurPerUsd: 1 / usdPerEur, quoted_at };
}

/**
 * Trae la cotización oficial del BCE. Devuelve `null` ante cualquier
 * problema —red, timeout, XML distinto, número que no cierra— para que quien
 * llama caiga en el proveedor de mercado en vez de quedarse sin conversión.
 */
export async function fetchEcbRates(): Promise<EcbQuote | null> {
  try {
    const res = await fetch(ECB_URL, {
      headers: {
        accept: "application/xml, text/xml",
        "user-agent": "fivi/1.0 (+https://github.com/vidalsotofelipe/fivi)",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return parseEcbXml(await res.text());
  } catch {
    return null;
  }
}
