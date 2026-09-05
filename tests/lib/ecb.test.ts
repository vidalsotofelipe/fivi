import { describe, expect, it } from "vitest";
import { parseEcbXml } from "@/lib/fx/ecb";

/**
 * El BCE publica un XML diario con cuántas unidades de cada moneda equivalen
 * a 1 EUR. FIVI necesita el inverso (EUR por USD), así que el parser invierte
 * acá — y falla cerrado si la forma cambia o el número no es plausible.
 */

/** Feed real de https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml (4/9/2026), recortado. */
const REAL_XML = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
	<gesmes:subject>Reference rates</gesmes:subject>
	<gesmes:Sender>
		<gesmes:name>European Central Bank</gesmes:name>
	</gesmes:Sender>
	<Cube>
		<Cube time='2026-09-04'>
			<Cube currency='USD' rate='1.1622'/>
			<Cube currency='JPY' rate='181.59'/>
			<Cube currency='GBP' rate='0.85898'/>
			<Cube currency='BRL' rate='5.9405'/>
		</Cube>
	</Cube>
</gesmes:Envelope>`;

describe("parseEcbXml", () => {
  it("lee la fecha e invierte USD-por-EUR a EUR-por-USD", () => {
    const q = parseEcbXml(REAL_XML);
    expect(q).not.toBeNull();
    expect(q!.usdPerEur).toBe(1.1622);
    expect(q!.eurPerUsd).toBeCloseTo(1 / 1.1622, 10);
    expect(q!.quoted_at).toBe("2026-09-04");
  });

  it("no le importa el orden de las monedas en el feed", () => {
    const reordered = REAL_XML.replace(
      "<Cube currency='USD' rate='1.1622'/>",
      "",
    ).replace(
      "<Cube currency='BRL' rate='5.9405'/>",
      "<Cube currency='BRL' rate='5.9405'/><Cube currency='USD' rate='1.1622'/>",
    );
    expect(parseEcbXml(reordered)?.usdPerEur).toBe(1.1622);
  });

  describe("falla cerrado", () => {
    it("sin fecha en el feed", () => {
      expect(parseEcbXml(REAL_XML.replace("time='2026-09-04'", ""))).toBeNull();
    });

    it("sin la moneda USD", () => {
      expect(
        parseEcbXml(REAL_XML.replace("<Cube currency='USD' rate='1.1622'/>", "")),
      ).toBeNull();
    });

    it("XML vacío o de mantenimiento", () => {
      expect(parseEcbXml("")).toBeNull();
      expect(parseEcbXml("<html>mantenimiento</html>")).toBeNull();
    });

    it("con un valor fuera de la banda plausible (celda equivocada)", () => {
      expect(
        parseEcbXml(REAL_XML.replace("rate='1.1622'", "rate='181.59'")),
      ).toBeNull();
      expect(
        parseEcbXml(REAL_XML.replace("rate='1.1622'", "rate='0'")),
      ).toBeNull();
    });
  });
});
