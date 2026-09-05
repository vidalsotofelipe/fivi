/**
 * Cotización oficial del dólar del **Banco Central do Brasil** (PTAX), vía la
 * API pública Olinda.
 *
 * Fuente: https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata —
 * `CotacaoDolarDia`, un banco central público, así que cuenta como fuente
 * oficial (a diferencia del agregador de mercado usado como base para el
 * resto de las monedas). A diferencia del BNA, esta sí es una API real
 * (OData/JSON), no una tabla HTML para parsear.
 *
 * El PTAX se publica una vez por día hábil (boletín de cierre, ~13h de
 * Brasilia) y no existe fines de semana/feriados: se pide la fecha de hoy y,
 * si no hay cotización todavía, se retrocede día por día hasta encontrar una
 * (o agotar el margen y devolver `null` — nunca se inventa una fecha).
 *
 * Igual que `bna.ts`: valida los números antes de creerles y **falla
 * cerrado** ante cualquier problema — red, timeout, forma de respuesta
 * distinta, números que no cierran.
 */

export interface BcbQuote {
  /** Reales por 1 dólar (punto medio entre compra y venta del PTAX). */
  brlPerUsd: number;
  compra: number;
  venda: number;
  /** ISO del día que publica el BCB. */
  quoted_at: string;
}

export const BCB_NAME = "Banco Central do Brasil";
export const BCB_URL_BASE =
  "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)";

const FETCH_TIMEOUT_MS = 8000;
/** Suficiente para saltar un fin de semana largo + feriado sin reintentar para siempre. */
const MAX_DAYS_BACK = 7;

/** Chequeos de plausibilidad, igual de estrictos que en `bna.ts`. */
function plausible(compra: number, venda: number): boolean {
  if (!(compra > 0) || !(venda > 0)) return false;
  if (venda < compra) return false;
  if (venda / compra > 1.5) return false;
  // Banda absoluta amplia (histórico BRL/USD): sólo descarta lecturas absurdas.
  if (compra < 0.5 || venda > 1000) return false;
  return true;
}

function formatMMDDYYYY(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}-${dd}-${d.getFullYear()}`;
}

/**
 * Parsea la respuesta OData de `CotacaoDolarDia`. Exportada aparte de
 * `fetchBcbPtax` para poder testearla sin red.
 */
export function parseBcbPtax(json: unknown): BcbQuote | null {
  if (typeof json !== "object" || json === null) return null;
  const value = (json as { value?: unknown }).value;
  if (!Array.isArray(value) || value.length === 0) return null;

  const last = value[value.length - 1] as Record<string, unknown>;
  const compra = last.cotacaoCompra;
  const venda = last.cotacaoVenda;
  const dataHora = last.dataHoraCotacao;
  if (
    typeof compra !== "number" ||
    typeof venda !== "number" ||
    typeof dataHora !== "string"
  ) {
    return null;
  }
  if (!plausible(compra, venda)) return null;

  const quoted_at = dataHora.slice(0, 10);
  if (Number.isNaN(new Date(quoted_at).getTime())) return null;

  return { compra, venda, brlPerUsd: (compra + venda) / 2, quoted_at };
}

/**
 * Trae la cotización oficial del BCB, retrocediendo día por día si el día
 * pedido todavía no tiene boletín (fin de semana, feriado, o todavía no
 * publicó hoy). Devuelve `null` si no hay nada en la ventana o ante
 * cualquier problema de red/forma — nunca inventa ni adivina.
 */
export async function fetchBcbPtax(): Promise<BcbQuote | null> {
  const today = new Date();
  for (let i = 0; i < MAX_DAYS_BACK; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateParam = formatMMDDYYYY(d);
    try {
      const res = await fetch(
        `${BCB_URL_BASE}?@dataCotacao='${dateParam}'&$format=json`,
        {
          headers: {
            accept: "application/json",
            "user-agent": "fivi/1.0 (+https://github.com/vidalsotofelipe/fivi)",
          },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        },
      );
      if (!res.ok) continue;
      const parsed = parseBcbPtax(await res.json());
      if (parsed) return parsed;
    } catch {
      // Sigue probando el día anterior.
    }
  }
  return null;
}
