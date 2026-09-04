/**
 * Detección de la moneda inicial al crear un grupo. Nunca bloquea: tiene un
 * timeout corto y siempre devuelve algo. El usuario puede cambiarla.
 *
 * Regla principal: **manda el país desde el que te conectás.**
 *   - Si sabemos el país y tenemos su moneda → esa.
 *   - Si sabemos el país pero su moneda no está soportada → **USD**. No se
 *     adivina con el idioma del navegador: alguien en Perú con el teléfono en
 *     inglés no debería terminar con dólares "por accidente" ni con euros.
 *   - Si NO sabemos el país (offline, sin header) → idioma del navegador →
 *     última moneda elegida → USD.
 *
 * No se consume ninguna API externa desde el navegador: el país lo da Vercel
 * en `/api/geo`. No se guarda la IP.
 */
import { isSupportedCurrency } from "@/domain/currencies";
import { currencyForCountry, DEFAULT_CURRENCY } from "@/domain/countryCurrency";

export type CurrencySource =
  | "geo"
  /** Sabemos el país, pero su moneda no está soportada: se usa USD. */
  | "country-unsupported"
  | "locale"
  | "last"
  | "default";

export interface CurrencyDetection {
  code: string;
  source: CurrencySource;
  /** País detectado (ISO 3166-1 alpha-2), si se pudo saber. */
  country?: string | null;
}

/** Moneda derivada de la región del navegador (`Intl.Locale`), si mapea. */
export function localeRegionCurrency(): string | null {
  try {
    const loc = new Intl.Locale(
      typeof navigator !== "undefined" ? navigator.language : "en",
    );
    const region = loc.region ?? loc.maximize().region ?? null;
    return currencyForCountry(region);
  } catch {
    return null;
  }
}

/** País desde el que se conecta el usuario, según el borde (Vercel). */
async function geoCountry(signal: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch("/api/geo", { signal, cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { country?: string | null };
    const c = body.country?.trim().toUpperCase();
    return c && /^[A-Z]{2}$/.test(c) ? c : null;
  } catch {
    return null;
  }
}

export { isSupportedCurrency };

/** Resuelve la moneda a partir de un país ya conocido. Nunca devuelve `null`. */
export function currencyForDetectedCountry(country: string): CurrencyDetection {
  const mapped = currencyForCountry(country);
  return mapped && isSupportedCurrency(mapped)
    ? { code: mapped, source: "geo", country }
    : { code: DEFAULT_CURRENCY, source: "country-unsupported", country };
}

export async function detectInitialCurrency(
  lastChosen?: string | null,
  { timeoutMs = 1500 }: { timeoutMs?: number } = {},
): Promise<CurrencyDetection> {
  const online = typeof navigator === "undefined" || navigator.onLine !== false;
  const last =
    lastChosen && isSupportedCurrency(lastChosen) ? lastChosen : null;

  if (online) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let country: string | null = null;
    try {
      country = await geoCountry(ctrl.signal);
    } finally {
      clearTimeout(timer);
    }
    // Con el país conocido, la decisión está tomada: su moneda, o USD.
    if (country) return currencyForDetectedCountry(country);
  }

  // Sin país (offline, o el borde no lo informó): una elección explícita previa
  // del usuario vale más que adivinar por el idioma del navegador.
  if (last) return { code: last, source: "last" };
  const loc = localeRegionCurrency();
  if (loc && isSupportedCurrency(loc)) return { code: loc, source: "locale" };
  return { code: DEFAULT_CURRENCY, source: "default" };
}
