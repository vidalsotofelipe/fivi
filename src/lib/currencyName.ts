/**
 * Nombre de una moneda en el idioma de la interfaz.
 *
 * `Intl.DisplayNames` cubre las 35 monedas del catálogo en es y en en. El nombre
 * del catálogo (`CURRENCIES[...].name`, en español) queda sólo como último
 * recurso si el runtime no soporta `DisplayNames`: si se usara siempre, una
 * interfaz en inglés mostraría "Quetzal guatemalteco".
 */
import { getCurrencyInfo } from "@/domain/currencies";
import type { CurrencyCode } from "@/domain/types";
import { BCP47, type Lang } from "@/i18n/config";

export function currencyDisplayName(code: CurrencyCode, lang: Lang): string {
  try {
    const localized = new Intl.DisplayNames([BCP47[lang]], {
      type: "currency",
    }).of(code);
    // `of()` devuelve el propio código cuando no conoce la moneda.
    if (localized && localized.toUpperCase() !== code) return localized;
  } catch {
    /* runtime sin DisplayNames */
  }
  return getCurrencyInfo(code).name;
}
