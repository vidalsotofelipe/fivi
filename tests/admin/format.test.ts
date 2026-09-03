import { afterEach, describe, expect, it } from "vitest";
import {
  ADMIN_DEFAULT_TZ,
  dateTime,
  envLabel,
  getAdminTimeZone,
  isValidTimeZone,
  roleLabel,
  setAdminTimeZone,
} from "@/lib/adminFormat";

afterEach(() => setAdminTimeZone(ADMIN_DEFAULT_TZ));

/**
 * El bug de QA: `2026-09-03T03:15:53Z` se veía como "2 sept 2026, 8:15 p. m."
 * (UTC-7, la zona del navegador de quien miraba) en vez de la hora de Argentina
 * (00:15 del día 3). El formato exacto (12/24 h, "a. m.") depende del ICU del
 * runtime, así que se comprueba el DÍA y que la zona efectivamente cambia la
 * salida, no los dígitos literales.
 */
describe("zona horaria del panel", () => {
  const UTC_INSTANT = "2026-09-03T03:15:53Z";

  it("muestra las fechas en la zona configurada, no en la del runtime", () => {
    setAdminTimeZone(ADMIN_DEFAULT_TZ); // America/Argentina/Buenos_Aires (UTC-3)
    const bsAs = dateTime(UTC_INSTANT);
    expect(bsAs).toMatch(/3 sept/i); // 00:15 del día 3

    setAdminTimeZone("America/Phoenix"); // UTC-7 fijo (sin DST) = el caso del bug
    const utc7 = dateTime(UTC_INSTANT);
    expect(utc7).toMatch(/2 sept/i); // 20:15 del día 2

    expect(bsAs).not.toBe(utc7); // la zona sí afecta la salida
  });

  it("respeta una zona alternativa (UTC)", () => {
    setAdminTimeZone("UTC");
    expect(getAdminTimeZone()).toBe("UTC");
    const utc = dateTime(UTC_INSTANT);
    expect(utc).toMatch(/3 sept/i);
    expect(utc).toMatch(/3:15/); // 03:15 exacto en UTC
  });

  it("una zona inválida vuelve al default y no rompe", () => {
    setAdminTimeZone("No/Existe");
    expect(getAdminTimeZone()).toBe(ADMIN_DEFAULT_TZ);
    expect(dateTime(UTC_INSTANT)).toMatch(/3 sept/i);
  });

  it("isValidTimeZone distingue IANA de basura", () => {
    expect(isValidTimeZone("America/Argentina/Buenos_Aires")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Europe/Madrid")).toBe(true);
    expect(isValidTimeZone("ARG")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone("America/Nowhere")).toBe(false);
  });

  it("fechas nulas o inválidas dan un guión", () => {
    expect(dateTime(null)).toBe("—");
    expect(dateTime("no-es-fecha")).toBe("—");
  });
});

describe("etiquetas en castellano", () => {
  it("envLabel traduce el entorno", () => {
    expect(envLabel("production")).toBe("Producción");
    expect(envLabel("preview")).toBe("Vista previa");
    expect(envLabel("development")).toBe("Desarrollo");
    expect(envLabel("otro")).toBe("otro");
  });

  it("roleLabel traduce el rol de grupo", () => {
    expect(roleLabel("owner")).toBe("Creador");
    expect(roleLabel("member")).toBe("Miembro");
    expect(roleLabel("x")).toBe("x");
  });
});
