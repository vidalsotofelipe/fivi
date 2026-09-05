import { describe, expect, it } from "vitest";
import { parseBcbPtax } from "@/lib/fx/bcbPtax";

/**
 * A diferencia del BNA, el BCB sí tiene una API real (OData/JSON) — pero
 * igual hay que validar la forma y fallar cerrado: fines de semana/feriados
 * devuelven `value: []`, y cualquier campo inesperado no debe inventar una
 * cotización.
 */

/** Respuesta real de CotacaoDolarDia (4/9/2026). */
const REAL_JSON = {
  "@odata.context":
    "https://was-p.bcnet.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata$metadata#_CotacaoDolarDia",
  value: [
    {
      cotacaoCompra: 5.1247,
      cotacaoVenda: 5.1253,
      dataHoraCotacao: "2026-09-04 13:03:59.556874",
    },
  ],
};

describe("parseBcbPtax", () => {
  it("lee compra, venta y el punto medio del dólar", () => {
    const q = parseBcbPtax(REAL_JSON);
    expect(q).not.toBeNull();
    expect(q!.compra).toBe(5.1247);
    expect(q!.venda).toBe(5.1253);
    expect(q!.brlPerUsd).toBeCloseTo(5.125, 4);
    expect(q!.quoted_at).toBe("2026-09-04");
  });

  it("toma la última cotización si hay más de una en el día", () => {
    const multi = {
      value: [
        { cotacaoCompra: 5.1, cotacaoVenda: 5.11, dataHoraCotacao: "2026-09-04 10:00:00" },
        { cotacaoCompra: 5.12, cotacaoVenda: 5.13, dataHoraCotacao: "2026-09-04 13:04:00" },
      ],
    };
    expect(parseBcbPtax(multi)!.brlPerUsd).toBeCloseTo(5.125, 4);
  });

  describe("falla cerrado", () => {
    it("fin de semana / feriado: value vacío", () => {
      expect(parseBcbPtax({ value: [] })).toBeNull();
    });

    it("forma de respuesta inesperada", () => {
      expect(parseBcbPtax(null)).toBeNull();
      expect(parseBcbPtax("no json")).toBeNull();
      expect(parseBcbPtax({})).toBeNull();
      expect(parseBcbPtax({ value: "no array" })).toBeNull();
    });

    it("campos no numéricos o faltantes", () => {
      expect(
        parseBcbPtax({ value: [{ cotacaoCompra: "5.1", cotacaoVenda: 5.13, dataHoraCotacao: "2026-09-04" }] }),
      ).toBeNull();
      expect(
        parseBcbPtax({ value: [{ cotacaoCompra: 5.1, dataHoraCotacao: "2026-09-04" }] }),
      ).toBeNull();
    });

    it("si la venda es menor que la compra (se leyó algo al revés)", () => {
      expect(
        parseBcbPtax({
          value: [{ cotacaoCompra: 5.13, cotacaoVenda: 5.1, dataHoraCotacao: "2026-09-04" }],
        }),
      ).toBeNull();
    });

    it("con valores en cero o negativos", () => {
      expect(
        parseBcbPtax({
          value: [{ cotacaoCompra: 0, cotacaoVenda: 5.13, dataHoraCotacao: "2026-09-04" }],
        }),
      ).toBeNull();
    });

    it("con fecha inválida", () => {
      expect(
        parseBcbPtax({
          value: [{ cotacaoCompra: 5.1, cotacaoVenda: 5.13, dataHoraCotacao: "not-a-date" }],
        }),
      ).toBeNull();
    });
  });
});
