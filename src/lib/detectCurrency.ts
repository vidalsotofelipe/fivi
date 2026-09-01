/**
 * Detección de la moneda inicial al crear un grupo. Nunca bloquea: tiene un
 * timeout corto y siempre devuelve algo. El usuario puede cambiarla.
 *
 * Orden (online):  país por IP (header de Vercel) → región del navegador
 *                  (`Intl.Locale`) → última moneda elegida → USD.
 * Orden (offline): última moneda elegida → región del navegador → USD.
 *
 * No se consume ninguna API externa desde el navegador: el país lo da Vercel
 * en `/api/geo`. No se guarda la IP.
 */
import { CURRENCIES } from "@/domain/currencies";
import { currencyForCountry, DEFAULT_CURRENCY } from "@/domain/countryCurrency";

export type CurrencySource = "geo" | "locale" | "last" | "default";

export interface CurrencyDetection {
  code: string;
  source: CurrencySource;
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

async function geoCurrency(signal: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch("/api/geo", { signal, cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { country?: string | null };
    return currencyForCountry(body.country);
  } catch {
    return null;
  }
}

/** `true` si `code` es una moneda que la app soporta explícitamente. */
export function isSupportedCurrency(code: string | null | undefined): boolean {
  return !!code && Object.prototype.hasOwnProperty.call(CURRENCIES, code);
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
    try {
      const geo = await geoCurrency(ctrl.signal);
      if (geo) return { code: geo, source: "geo" };
    } finally {
      clearTimeout(timer);
    }
    const loc = localeRegionCurrency();
    if (loc) return { code: loc, source: "locale" };
    if (last) return { code: last, source: "last" };
    return { code: DEFAULT_CURRENCY, source: "default" };
  }

  // Offline
  if (last) return { code: last, source: "last" };
  const loc = localeRegionCurrency();
  if (loc) return { code: loc, source: "locale" };
  return { code: DEFAULT_CURRENCY, source: "default" };
}
