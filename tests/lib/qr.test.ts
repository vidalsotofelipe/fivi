import { describe, expect, it } from "vitest";
import { encode } from "uqr";
import { qrPath } from "@/lib/qrPath";

/**
 * El QR lleva el enlace de invitación al grupo. Un QR mal dibujado se ve
 * igual de "correcto" en pantalla que uno bueno: nadie se da cuenta hasta
 * que alguien intenta escanearlo y no pasa nada. El error clásico es
 * invertir fila/columna, que lo deja transpuesto e ilegible — de ahí que los
 * casos de abajo sean asimétricos a propósito.
 */

describe("qrPath", () => {
  it("dibuja x como columna e y como fila (no al revés)", () => {
    // Un único módulo en la columna 1, fila 0.
    const matrix = [
      [false, true],
      [false, false],
    ];
    expect(qrPath(matrix)).toBe("M1 0h1v1h-1z");
    // Transpuesto daría "M0 1…": si algún día sale eso, el QR no escanea.
  });

  it("recorre toda la matriz en orden fila por fila", () => {
    const matrix = [
      [true, false, true],
      [false, true, false],
    ];
    expect(qrPath(matrix)).toBe("M0 0h1v1h-1zM2 0h1v1h-1zM1 1h1v1h-1z");
  });

  it("una matriz vacía no dibuja nada (en vez de romper)", () => {
    expect(qrPath([])).toBe("");
    expect(qrPath([[false, false]])).toBe("");
  });

  it("dibuja exactamente un módulo por celda encendida de un QR real", () => {
    const { data } = encode("https://fivi-two.vercel.app/join/abc123", {
      border: 4,
    });
    const encendidos = data.flat().filter(Boolean).length;
    const dibujados = qrPath(data).match(/M/g)?.length ?? 0;
    expect(dibujados).toBe(encendidos);
    expect(encendidos).toBeGreaterThan(0);
  });
});

describe("QR de invitación", () => {
  it("incluye la zona de silencio que pide la especificación", () => {
    const sinBorde = encode("https://fivi-two.vercel.app/join/abc", { border: 0 });
    const conBorde = encode("https://fivi-two.vercel.app/join/abc", { border: 4 });
    // 4 módulos en blanco de cada lado.
    expect(conBorde.size).toBe(sinBorde.size + 8);

    // Las 4 primeras filas quedan vacías: es el margen, no datos.
    for (let y = 0; y < 4; y++) {
      expect(conBorde.data[y]!.some(Boolean)).toBe(false);
    }
  });

  it("entra un token de invitación completo sin recortarlo", () => {
    // Los tokens son de 256 bits en base64url (~43 caracteres).
    const url = `https://fivi-two.vercel.app/join/${"X".repeat(43)}`;
    expect(() => encode(url, { border: 4 })).not.toThrow();
    expect(encode(url, { border: 4 }).size).toBeGreaterThan(20);
  });
});
