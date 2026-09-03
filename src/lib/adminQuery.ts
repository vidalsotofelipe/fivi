/**
 * Helpers para los Route Handlers del panel admin: parseo/validación de query
 * params (paginación, orden, rango de fechas) y una envoltura de `rpc()` sobre
 * el cliente service-role que lanza si Postgres devuelve error.
 *
 * Toda la agregación vive en funciones SQL (`supabase/migrations/0011_*`); acá
 * sólo se arman los argumentos.
 */
import { getAdminClient } from "./supabaseAdmin";

export function sp(req: Request): URLSearchParams {
  return new URL(req.url).searchParams;
}

export function str(params: URLSearchParams, key: string): string | null {
  const v = params.get(key);
  return v && v.trim() !== "" ? v.trim() : null;
}

/** Paginación server-side. `limit` acotado; `offset` derivado de `page` o directo. */
export function pageArgs(
  params: URLSearchParams,
  { maxLimit = 100, defLimit = 25 } = {},
): { limit: number; offset: number } {
  const num = (key: string): number | null => {
    const raw = params.get(key);
    if (raw == null || raw.trim() === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };
  const rawLimit = num("limit");
  const limit = rawLimit != null && rawLimit > 0 ? Math.min(Math.floor(rawLimit), maxLimit) : defLimit;
  const rawOffset = num("offset");
  const rawPage = num("page");
  const offset =
    rawOffset != null && rawOffset >= 0
      ? Math.floor(rawOffset)
      : rawPage != null && rawPage > 1
        ? (Math.floor(rawPage) - 1) * limit
        : 0;
  return { limit, offset };
}

export function sortArgs(
  params: URLSearchParams,
  allowed: readonly string[],
  fallback: string,
): { sort: string; dir: "asc" | "desc" } {
  const s = str(params, "sort");
  const d = (str(params, "dir") ?? "").toLowerCase();
  return {
    sort: s && allowed.includes(s) ? s : fallback,
    dir: d === "asc" ? "asc" : "desc",
  };
}

export interface DateRange {
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
}

/**
 * Rango a partir de `?period=7|30|90` (días hacia atrás desde ahora) o
 * `?from&to` (ISO). El período previo es la ventana inmediatamente anterior de
 * igual duración, para los comparativos del dashboard.
 */
export function dateRange(params: URLSearchParams): DateRange {
  const now = Date.now();
  const fromRaw = str(params, "from");
  const toRaw = str(params, "to");
  let from: number;
  let to: number;

  if (fromRaw && toRaw && !Number.isNaN(Date.parse(fromRaw)) && !Number.isNaN(Date.parse(toRaw))) {
    from = Date.parse(fromRaw);
    to = Date.parse(toRaw);
  } else {
    const period = Number(params.get("period"));
    const days = [7, 30, 90].includes(period) ? period : 30;
    to = now;
    from = now - days * 86_400_000;
  }
  if (to < from) [from, to] = [to, from];
  const span = Math.max(to - from, 1);
  return {
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    prevFrom: new Date(from - span).toISOString(),
    prevTo: new Date(from).toISOString(),
  };
}

/** Ejecuta una función SQL con el cliente service-role. Lanza si hay error PG. */
export async function rpc<T = unknown>(
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await getAdminClient().rpc(fn, args);
  if (error) {
    const err = new Error(error.message) as Error & { pgcode?: string };
    err.pgcode = error.code;
    throw err;
  }
  return data as T;
}

/** UUID v4-ish (acepta cualquier variante). Para validar params de ruta. */
export function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

// Defensa de servidor para el rango de fechas: la UI ya lo bloquea, pero un
// pedido directo con el rango invertido no debe devolver "todo".
export { dateRangeInvalid } from "./adminDates";
