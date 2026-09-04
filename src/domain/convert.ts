/**
 * Conversión de importes entre monedas — **sólo para visualización**.
 *
 * Reglas (ver el pedido de "moneda principal"):
 *  - Nunca modifica un importe original: `convert` devuelve un valor nuevo,
 *    aproximado, para mostrar al lado del real.
 *  - Nunca se suman importes de monedas distintas sin convertir antes.
 *  - Un tipo de cambio puede necesitar más decimales que un importe: se guarda
 *    como número (float) y se redondea **una sola vez**, al final, a la unidad
 *    mínima de la moneda destino.
 *
 * La aritmética de dinero "de verdad" (la que se persiste) sigue en
 * `domain/money.ts` con enteros. Esto es la capa de estimación.
 */
import type { CurrencyCode } from "./types";
import { minorUnitFactor } from "./currencies";

/**
 * Una tabla de cotizaciones con una moneda base: `rates[X]` = cuántas unidades
 * de `X` equivalen a 1 unidad de `base`. Es la forma que devuelven casi todos
 * los proveedores (`open.er-api.com`, ECB, …).
 */
/** De dónde salió la cotización de UNA moneda. */
export interface RateSource {
  /** Nombre de la fuente, tal como se cita al usuario. */
  provider: string;
  /** Banco central / organismo oficial (`true`) o referencia de mercado. */
  official: boolean;
  /** ISO de la cotización de esa moneda (puede diferir del resto de la tabla). */
  quoted_at: string;
  /** Aclaración corta de qué valor es (p. ej. "punto medio compra/venta"). */
  note?: string;
}

export interface RateTable {
  base: CurrencyCode;
  /** `rates[code]` unidades de `code` por 1 de `base`. Incluye `rates[base] = 1`. */
  rates: Readonly<Record<string, number>>;
  /**
   * Fuente por moneda. Las que no tienen entrada propia vienen del proveedor
   * base (`provider`). Permite decir "ARS: BNA (oficial), el resto: referencia
   * de mercado" en vez de una sola etiqueta para toda la tabla.
   */
  sources?: Readonly<Record<string, RateSource>>;
  /** Proveedor base de la cotización (para citar la fuente). */
  provider: string;
  /**
   * Si la fuente es **oficial** (banco central u organismo de gobierno) o una
   * referencia de mercado. Se muestra al usuario: una conversión estimada con
   * una fuente alternativa no puede presentarse como cotización oficial.
   * Es la condición del proveedor BASE; `sources` puede marcar como oficiales
   * monedas puntuales. Ver `docs/FX_SOURCES.md`.
   */
  official: boolean;
  /** ISO del momento en que el proveedor calculó la cotización. */
  quoted_at: string;
  /** ISO del momento en que FIVI la trajo. */
  fetched_at: string;
}

/**
 * Tipo de cambio `from → to` a partir de una tabla con cualquier base.
 * `rate(from→to) = rates[to] / rates[from]`. Devuelve `null` si falta alguna.
 */
export function rateBetween(
  table: Pick<RateTable, "rates">,
  from: CurrencyCode,
  to: CurrencyCode,
): number | null {
  if (from === to) return 1;
  const rFrom = table.rates[from];
  const rTo = table.rates[to];
  if (!rFrom || !rTo || rFrom <= 0 || rTo <= 0) return null;
  return rTo / rFrom;
}

/**
 * Convierte `minor` (unidades mínimas de `from`) a unidades mínimas de `to`
 * usando `rate` (`to` por 1 `from`, en unidades mayores). Redondea una vez.
 * Soporta montos negativos (saldos). Devuelve `null` si el rate no sirve.
 */
export function convertMinor(
  minor: number,
  from: CurrencyCode,
  to: CurrencyCode,
  rate: number,
): number | null {
  if (!Number.isFinite(rate) || rate <= 0) return null;
  if (from === to) return minor;
  const major = minor / minorUnitFactor(from);
  const convertedMajor = major * rate;
  return Math.round(convertedMajor * minorUnitFactor(to));
}

/**
 * Convierte `minor` de `from` a `to` resolviendo el tipo de cambio desde una
 * `RateTable` (de cualquier base). `null` si falta la cotización de alguna de
 * las dos monedas.
 */
export function convertWithTable(
  minor: number,
  from: CurrencyCode,
  to: CurrencyCode,
  table: Pick<RateTable, "rates">,
): number | null {
  const rate = rateBetween(table, from, to);
  return rate == null ? null : convertMinor(minor, from, to, rate);
}

/** Fuente efectiva de una moneda: la propia si la tiene, si no la del proveedor base. */
export function sourceFor(
  table: Pick<RateTable, "provider" | "official" | "quoted_at" | "sources">,
  code: CurrencyCode,
): RateSource {
  return (
    table.sources?.[code] ?? {
      provider: table.provider,
      official: table.official,
      quoted_at: table.quoted_at,
    }
  );
}
