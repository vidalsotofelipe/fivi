import { describe, expect, it } from "vitest";
import es from "@/i18n/locales/es.json";
import en from "@/i18n/locales/en.json";

/**
 * Los dos bundles deben tener exactamente las mismas claves (incluidas las de
 * pluralización `_one`/`_other`). Si falta una traducción, react-i18next cae al
 * español y el texto queda "a medias" en inglés: este test lo detecta antes.
 */

type Json = Record<string, unknown>;

function flatten(obj: Json, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return v && typeof v === "object" && !Array.isArray(v)
      ? flatten(v as Json, key)
      : [key];
  });
}

describe("paridad de claves i18n es/en", () => {
  const esKeys = flatten(es as Json).sort();
  const enKeys = flatten(en as Json).sort();

  it("inglés no tiene claves que falten en español", () => {
    expect(enKeys.filter((k) => !esKeys.includes(k))).toEqual([]);
  });

  it("español no tiene claves que falten en inglés", () => {
    expect(esKeys.filter((k) => !enKeys.includes(k))).toEqual([]);
  });

  it("ningún valor traducido queda vacío", () => {
    const emptyIn = (obj: Json, prefix = ""): string[] =>
      Object.entries(obj).flatMap(([k, v]) => {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === "object") return emptyIn(v as Json, key);
        return typeof v === "string" && v.trim() === "" ? [key] : [];
      });
    expect(emptyIn(es as Json)).toEqual([]);
    expect(emptyIn(en as Json)).toEqual([]);
  });
});
