/**
 * Resumen de "todos mis grupos" para la pantalla de inicio.
 *
 * **Se agrega por moneda, nunca entre monedas.** Un grupo tiene una sola moneda
 * y FIVI no convierte divisas (sección 2): sumar 300 € con 60 £ en un número
 * daría un total falso. Si todos los grupos con saldo comparten moneda hay un
 * único total (el caso normal); si no, se muestra uno por moneda.
 *
 * Sólo entran los grupos donde el usuario indicó quién es (`my_balance_minor`
 * distinto de `null`): sin eso no hay un "te deben / debés" que calcular.
 */
import type { CurrencyCode } from "./types";
import { convertWithTable, type RateTable } from "./convert";

export interface GroupBalanceInput {
  currency_code: CurrencyCode;
  /** Saldo del usuario en ese grupo; `null` si no eligió quién es. */
  my_balance_minor: number | null;
}

export interface CurrencyTotal {
  currency: CurrencyCode;
  /** Suma de los saldos positivos (lo que le deben al usuario). */
  owed_to_me_minor: number;
  /** Suma de los saldos negativos, en positivo (lo que el usuario debe). */
  i_owe_minor: number;
  /**
   * Saldo NETO en esa moneda: `owed_to_me_minor - i_owe_minor`. Es lo que se
   * convierte a la moneda principal para el balance global (nunca se convierten
   * los brutos por separado). Se calcula sobre los saldos ya netos por grupo,
   * así que "debo USD 100 en A" + "me deben USD 20 en B" = neto USD -80.
   */
  net_minor: number;
}

export interface GroupsSummary {
  /** Un total por moneda, ordenado por monto involucrado (desc) y luego código. */
  totals: CurrencyTotal[];
  /** Grupos activos considerados. */
  active_groups: number;
  /** Grupos donde todavía no se indicó quién es el usuario. */
  groups_without_me: number;
  /** No hay ninguna deuda en ninguna moneda. */
  all_settled: boolean;
}

export function summarizeGroups(
  groups: readonly GroupBalanceInput[],
): GroupsSummary {
  type Acc = Omit<CurrencyTotal, "net_minor">;
  const byCurrency = new Map<string, Acc>();
  let withoutMe = 0;

  for (const g of groups) {
    if (g.my_balance_minor === null) {
      withoutMe++;
      continue;
    }
    const acc = byCurrency.get(g.currency_code) ?? {
      currency: g.currency_code,
      owed_to_me_minor: 0,
      i_owe_minor: 0,
    };
    if (g.my_balance_minor > 0) acc.owed_to_me_minor += g.my_balance_minor;
    else if (g.my_balance_minor < 0) acc.i_owe_minor += -g.my_balance_minor;
    byCurrency.set(g.currency_code, acc);
  }

  const totals = [...byCurrency.values()]
    .map((t) => ({ ...t, net_minor: t.owed_to_me_minor - t.i_owe_minor }))
    // Se descartan las monedas donde quedó todo en cero: no aportan información.
    .filter((t) => t.owed_to_me_minor !== 0 || t.i_owe_minor !== 0)
    .sort(
      (a, b) =>
        b.owed_to_me_minor + b.i_owe_minor - (a.owed_to_me_minor + a.i_owe_minor) ||
        a.currency.localeCompare(b.currency),
    );

  return {
    totals,
    active_groups: groups.length,
    groups_without_me: withoutMe,
    all_settled: totals.length === 0,
  };
}

export interface GlobalBalance {
  /** Moneda principal a la que se convirtió todo. */
  currency: CurrencyCode;
  /** Saldo global estimado (neto de todas las monedas convertidas), en unidades mínimas. */
  balance_minor: number;
  /** Códigos de moneda que SÍ se pudieron convertir. */
  converted: CurrencyCode[];
  /** Códigos con saldo pero sin cotización disponible: NO entran en el total. */
  missing: CurrencyCode[];
  /** La cotización usada puede estar desactualizada. */
  stale: boolean;
  /** ISO de la cotización usada (para "actualizada el …"). */
  quoted_at: string | null;
  /** Proveedor de la cotización. */
  provider: string | null;
}

/**
 * Balance global estimado: convierte el saldo NETO de cada moneda a
 * `preferredCurrency` y los suma. Nunca mezcla monedas sin convertir. Las
 * monedas sin cotización quedan fuera del total y se listan en `missing` para
 * avisar al usuario.
 *
 * `table` puede ser `null` (sin cotizaciones): entonces sólo entra la moneda
 * principal si el usuario tiene saldo en ella.
 */
export function globalBalance(
  totals: readonly CurrencyTotal[],
  preferredCurrency: CurrencyCode,
  table: RateTable | null,
  { stale = false }: { stale?: boolean } = {},
): GlobalBalance {
  let balance = 0;
  const converted: CurrencyCode[] = [];
  const missing: CurrencyCode[] = [];

  for (const t of totals) {
    if (t.net_minor === 0) continue;
    if (t.currency === preferredCurrency) {
      balance += t.net_minor;
      converted.push(t.currency);
      continue;
    }
    const conv = table
      ? convertWithTable(t.net_minor, t.currency, preferredCurrency, table)
      : null;
    if (conv == null) missing.push(t.currency);
    else {
      balance += conv;
      converted.push(t.currency);
    }
  }

  return {
    currency: preferredCurrency,
    balance_minor: balance,
    converted,
    missing,
    stale: stale && converted.some((c) => c !== preferredCurrency),
    quoted_at: table?.quoted_at ?? null,
    provider: table?.provider ?? null,
  };
}

/** Iniciales para el avatar del grupo: 2 letras, determinísticas. */
export function groupInitials(name: string): string {
  const words = name
    .trim()
    .split(/[\s·\-–—_/]+/)
    .filter((w) => /\p{L}|\p{N}/u.test(w));
  if (words.length === 0) return "··";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}
