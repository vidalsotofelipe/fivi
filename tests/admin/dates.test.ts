import { describe, expect, it } from "vitest";
import {
  DATE_RANGE_MESSAGE,
  dateRangeError,
  dateRangeInvalid,
} from "@/lib/adminDates";

/**
 * QA: en Movimientos, con "Desde" posterior a "Hasta" el filtro se ignoraba y
 * volvían todos los resultados. Ahora se detecta y se muestra el error.
 */
describe("validación de rango de fechas (panel)", () => {
  it("marca error si Desde es posterior a Hasta", () => {
    expect(dateRangeError("2026-09-10", "2026-09-01")).toBe(DATE_RANGE_MESSAGE);
    expect(dateRangeInvalid("2026-09-10", "2026-09-01")).toBe(true);
  });

  it("no marca error con un rango válido o igual", () => {
    expect(dateRangeError("2026-09-01", "2026-09-10")).toBeNull();
    expect(dateRangeError("2026-09-05", "2026-09-05")).toBeNull();
    expect(dateRangeInvalid("2026-09-01", "2026-09-10")).toBe(false);
  });

  it("sin alguno de los dos extremos no hay rango que validar", () => {
    expect(dateRangeError("", "2026-09-01")).toBeNull();
    expect(dateRangeError("2026-09-01", "")).toBeNull();
    expect(dateRangeError(null, null)).toBeNull();
    expect(dateRangeError(undefined, undefined)).toBeNull();
  });

  it("también funciona con timestamps ISO completos", () => {
    expect(
      dateRangeError("2026-09-10T00:00:00Z", "2026-09-01T00:00:00Z"),
    ).toBe(DATE_RANGE_MESSAGE);
    expect(
      dateRangeError("2026-09-01T00:00:00Z", "2026-09-10T00:00:00Z"),
    ).toBeNull();
  });
});
