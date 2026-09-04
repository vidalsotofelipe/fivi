/**
 * Cotización oficial del dólar del **Banco de la Nación Argentina**.
 *
 * Fuente: https://bna.com.ar/Cotizador/MonedasHistorico — "Cotizaciones de
 * divisas en el Mercado Libre de Cambios, Valor Hoy". Es un banco público, así
 * que cuenta como fuente oficial (a diferencia del agregador de mercado que se
 * usa como base para el resto de las monedas).
 *
 * **No hay API**: el BNA publica una tabla HTML. Se parsea, con todas las
 * precauciones que eso exige:
 *  - se busca la fila por su ETIQUETA ("Dolar U.S.A"), no por posición;
 *  - se descartan las filas marcadas `(*)`, que cotizan cada 100 unidades;
 *  - se validan los números antes de creerles (ver `plausible`);
 *  - ante cualquier duda se devuelve `null` y el sistema sigue con el
 *    proveedor de mercado. **Nunca** se inventa ni se adivina una cotización.
 *
 * Qué número se usa: el **punto medio entre compra y venta**. Un saldo puede ser
 * a favor o en contra, así que tomar una sola punta inclinaría la estimación
 * hacia un lado. El detalle de conversión muestra la fuente y la fecha.
 */

/** Cotización de una moneda contra el peso argentino. */
export interface BnaQuote {
  /** Pesos por 1 dólar (punto medio entre compra y venta). */
  arsPerUsd: number;
  compra: number;
  venta: number;
  /** ISO del día que publica el BNA. */
  quoted_at: string;
}

export const BNA_URL = "https://bna.com.ar/Cotizador/MonedasHistorico";
export const BNA_NAME = "Banco de la Nación Argentina";

const FETCH_TIMEOUT_MS = 8000;

/** Quita etiquetas y normaliza espacios y entidades básicas de una celda. */
function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parsea un número del cotizador. El BNA hoy publica "1499.0000" (punto
 * decimal, sin separador de miles), pero conviene tolerar "1.499,00" por si
 * cambia el formato. Se aplica la misma regla que en el resto de la app: con los
 * dos separadores presentes, el último es el decimal.
 */
export function parseBnaNumber(raw: string): number | null {
  const body = raw.replace(/[^\d.,]/g, "");
  if (body === "") return null;

  const dots = (body.match(/\./g) ?? []).length;
  const commas = (body.match(/,/g) ?? []).length;

  let decimalSep: "." | "," | null = null;
  if (dots > 0 && commas > 0) {
    decimalSep = body.lastIndexOf(".") > body.lastIndexOf(",") ? "." : ",";
  } else if (dots + commas === 1) {
    const sep: "." | "," = dots === 1 ? "." : ",";
    // Con exactamente 3 dígitos detrás es separador de miles ("1.499");
    // con cualquier otra cantidad, decimal ("1499.0000", "1499,5").
    decimalSep = body.length - body.lastIndexOf(sep) - 1 === 3 ? null : sep;
  }

  const idx = decimalSep === null ? -1 : body.lastIndexOf(decimalSep);
  const normalized =
    idx < 0
      ? body.replace(/[.,]/g, "")
      : `${body.slice(0, idx).replace(/[.,]/g, "")}.${body.slice(idx + 1)}`;

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/**
 * Chequeos de plausibilidad. No pretenden adivinar el valor "correcto": sólo
 * detectar que se leyó la celda equivocada o que la página cambió de forma.
 */
function plausible(compra: number, venta: number): boolean {
  if (!(compra > 0) || !(venta > 0)) return false;
  if (venta < compra) return false;
  // Un spread mayor al 50 % significa que algo se leyó mal.
  if (venta / compra > 1.5) return false;
  // Banda absoluta muy amplia: sólo descarta lecturas absurdas.
  if (compra < 1 || venta > 100_000_000) return false;
  return true;
}

/** `Fecha: 3/9/2026` -> `2026-09-03`. `null` si no aparece. */
export function parseBnaDate(html: string): string | null {
  const m = /Fecha:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i.exec(html);
  if (!m) return null;
  const [, d, mo, y] = m;
  const day = d!.padStart(2, "0");
  const month = mo!.padStart(2, "0");
  const iso = `${y}-${month}-${day}`;
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}

/**
 * Extrae la cotización del dólar de la página del cotizador.
 * Exportada aparte de `fetchBnaUsd` para poder testearla sin red.
 */
export function parseBnaUsd(html: string): BnaQuote | null {
  // La tabla del cotizador. Si no está, no se sigue adivinando.
  const table = /<table[^>]*class="[^"]*cotizador[^"]*"[^>]*>([\s\S]*?)<\/table>/i
    .exec(html)?.[1];
  if (!table) return null;

  for (const row of table.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = (row.match(/<td[\s\S]*?<\/td>/gi) ?? []).map(stripTags);
    if (cells.length < 3) continue;

    const label = cells[0]!;
    // `(*)` = cotización cada 100 unidades. El dólar no la lleva; si algún día
    // la llevara, mejor no convertir que convertir mal.
    if (label.includes("(*)")) continue;
    if (!/d[oó]lar\s*u\.?\s*s\.?\s*a/i.test(label)) continue;

    const compra = parseBnaNumber(cells[1]!);
    const venta = parseBnaNumber(cells[2]!);
    if (compra == null || venta == null || !plausible(compra, venta)) return null;

    return {
      compra,
      venta,
      arsPerUsd: (compra + venta) / 2,
      quoted_at: parseBnaDate(html) ?? new Date().toISOString().slice(0, 10),
    };
  }
  return null;
}

/**
 * Trae la cotización oficial del BNA. Devuelve `null` ante cualquier problema
 * —red, timeout, HTML distinto, números que no cierran— para que quien llama
 * caiga en el proveedor de mercado en vez de quedarse sin conversión.
 */
export async function fetchBnaUsd(): Promise<BnaQuote | null> {
  try {
    const res = await fetch(BNA_URL, {
      headers: {
        accept: "text/html",
        // Un UA identificable: es un scrape declarado, no disimulado.
        "user-agent": "fivi/1.0 (+https://github.com/vidalsotofelipe/fivi)",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return parseBnaUsd(await res.text());
  } catch {
    return null;
  }
}
