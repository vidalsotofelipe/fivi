import { describe, expect, it } from "vitest";
import { parseBnaDate, parseBnaNumber, parseBnaUsd } from "@/lib/fx/bna";

/**
 * El BNA no publica API: hay que leer su tabla HTML. Estos tests fijan el
 * comportamiento del parser contra el marcado real y, sobre todo, que **falle
 * cerrado**: ante cualquier duda devuelve `null` y la app cae en el proveedor de
 * mercado, en vez de inventar una cotización.
 */

/** Marcado real de https://bna.com.ar/Cotizador/MonedasHistorico (3/9/2026). */
const REAL_HTML = `
<div class="cotizacion">
  <p>Fecha: 3/9/2026</p>
  <table class="table table-bordered cotizador">
    <thead><tr><th>Monedas</th><th>Compra</th><th>Venta</th></tr></thead>
    <tbody>
      <tr> <td>Dolar U.S.A</td> <td class="dest">1499.0000</td> <td class="dest">1508.0000</td> </tr>
      <tr> <td>Libra Esterlina</td> <td class="dest">2028.4468</td> <td class="dest">2045.1496</td> </tr>
      <tr> <td>Euro</td> <td class="dest">1742.2877</td> <td class="dest">1756.5184</td> </tr>
      <tr> <td>Franco Suizos (*)</td> <td class="dest">185742.7304</td> <td class="dest">187109.5283</td> </tr>
      <tr> <td>YENES (*)</td> <td class="dest">963.8734</td> <td class="dest">971.3297</td> </tr>
    </tbody>
  </table>
</div>`;

describe("parseBnaUsd", () => {
  it("lee compra, venta y el punto medio del dólar", () => {
    const q = parseBnaUsd(REAL_HTML);
    expect(q).not.toBeNull();
    expect(q!.compra).toBe(1499);
    expect(q!.venta).toBe(1508);
    // Un saldo puede ser a favor o en contra: se usa el medio, no una punta.
    expect(q!.arsPerUsd).toBe(1503.5);
    expect(q!.quoted_at).toBe("2026-09-03");
  });

  it("busca la fila por su etiqueta, no por posición", () => {
    // El dólar movido al final: el resultado tiene que ser el mismo.
    const reordered = REAL_HTML.replace(
      /<tr> <td>Dolar U\.S\.A<\/td>[\s\S]*?<\/tr>/,
      "",
    ).replace(
      "</tbody>",
      '<tr> <td>Dolar U.S.A</td> <td class="dest">1499.0000</td> <td class="dest">1508.0000</td> </tr></tbody>',
    );
    expect(parseBnaUsd(reordered)?.arsPerUsd).toBe(1503.5);
  });

  it("nunca toma una fila marcada (*), que cotiza cada 100 unidades", () => {
    const starred = REAL_HTML.replace("Dolar U.S.A", "Dolar U.S.A (*)");
    expect(parseBnaUsd(starred)).toBeNull();
  });

  it("tolera el formato con separador de miles por si cambia", () => {
    const otherFormat = REAL_HTML.replace("1499.0000", "1.499,50").replace(
      "1508.0000",
      "1.508,50",
    );
    const q = parseBnaUsd(otherFormat);
    expect(q!.compra).toBe(1499.5);
    expect(q!.venta).toBe(1508.5);
  });

  describe("falla cerrado", () => {
    it("sin la tabla del cotizador", () => {
      expect(parseBnaUsd("<html><body>mantenimiento</body></html>")).toBeNull();
    });

    it("sin fila de dólar", () => {
      expect(
        parseBnaUsd(REAL_HTML.replace("Dolar U.S.A", "Corona Sueca")),
      ).toBeNull();
    });

    it("con celdas vacías o no numéricas", () => {
      expect(parseBnaUsd(REAL_HTML.replace("1499.0000", "s/c"))).toBeNull();
      expect(parseBnaUsd(REAL_HTML.replace("1499.0000", ""))).toBeNull();
    });

    it("si la venta es menor que la compra (se leyó algo al revés)", () => {
      expect(parseBnaUsd(REAL_HTML.replace("1508.0000", "1000.0000"))).toBeNull();
    });

    it("si el spread es absurdo (se leyó la celda equivocada)", () => {
      expect(
        parseBnaUsd(REAL_HTML.replace("1508.0000", "185742.7304")),
      ).toBeNull();
    });

    it("con valores en cero o negativos", () => {
      expect(parseBnaUsd(REAL_HTML.replace("1499.0000", "0"))).toBeNull();
    });
  });

  it("sin fecha en la página usa el día de hoy en vez de fallar", () => {
    const noDate = REAL_HTML.replace("Fecha: 3/9/2026", "");
    const q = parseBnaUsd(noDate);
    expect(q).not.toBeNull();
    expect(q!.quoted_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("parseBnaNumber", () => {
  it("lee los dos formatos posibles sin ambigüedad", () => {
    expect(parseBnaNumber("1499.0000")).toBe(1499);
    expect(parseBnaNumber("1.499,50")).toBe(1499.5);
    expect(parseBnaNumber("1499")).toBe(1499);
    expect(parseBnaNumber("1.499")).toBe(1499); // 3 dígitos detrás: miles
    expect(parseBnaNumber("963.8734")).toBe(963.8734);
  });

  it("devuelve null para texto sin números", () => {
    expect(parseBnaNumber("s/c")).toBeNull();
    expect(parseBnaNumber("")).toBeNull();
  });
});

describe("parseBnaDate", () => {
  it("convierte el formato del BNA a ISO", () => {
    expect(parseBnaDate("Fecha: 3/9/2026")).toBe("2026-09-03");
    expect(parseBnaDate("Fecha: 15/12/2025")).toBe("2025-12-15");
  });

  it("null si no está o no es una fecha", () => {
    expect(parseBnaDate("sin fecha")).toBeNull();
    expect(parseBnaDate("Fecha: 99/99/2026")).toBeNull();
  });
});
