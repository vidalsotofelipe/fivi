/**
 * Ranking de conceptos ("descripciones") más usados en un grupo, para el picker
 * de gastos rápidos. Pura y determinista: recibe las descripciones ya ordenadas
 * por fecha desc (como las devuelve `listExpenses`) y no toca la base.
 *
 * No hay categorías en el modelo de FIVI: sólo se sugiere el texto del concepto.
 */

/** Normaliza para agrupar: minúsculas, sin acentos, espacios colapsados. */
export function normalizeConcept(raw: string): string {
  let out = "";
  for (const ch of raw.normalize("NFD")) {
    const code = ch.codePointAt(0) ?? 0;
    // Descarta marcas diacríticas combinantes (U+0300–U+036F): "Café" ≡ "cafe".
    if (code >= 0x0300 && code <= 0x036f) continue;
    out += ch;
  }
  return out.trim().replace(/\s+/g, " ").toLowerCase();
}

export interface RankedConcept {
  /** Etiqueta a precargar (la grafía más reciente entre las coincidencias). */
  label: string;
  count: number;
}

/**
 * Devuelve los conceptos que aparecen al menos `minCount` veces, del más al
 * menos frecuente; a igual frecuencia, primero el usado más recientemente
 * (se asume `descriptions` en orden fecha desc).
 */
export function rankConcepts(
  descriptions: readonly string[],
  { minCount = 2, limit = 6 }: { minCount?: number; limit?: number } = {},
): RankedConcept[] {
  const acc = new Map<
    string,
    { label: string; count: number; firstIndex: number }
  >();

  descriptions.forEach((raw, index) => {
    const key = normalizeConcept(raw);
    if (!key) return;
    const existing = acc.get(key);
    if (existing) existing.count += 1;
    else acc.set(key, { label: raw.trim(), count: 1, firstIndex: index });
  });

  return [...acc.values()]
    .filter((c) => c.count >= minCount)
    .sort((a, b) => b.count - a.count || a.firstIndex - b.firstIndex)
    .slice(0, limit)
    .map(({ label, count }) => ({ label, count }));
}
