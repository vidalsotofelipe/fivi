import { describe, expect, it } from "vitest";
import { buildGroupCsv, csvFileName, type ExportCsvLabels } from "@/lib/exportCsv";
import type { Expense, Group, Participant, Payment } from "@/domain/types";

const labels: ExportCsvLabels = {
  groupLabel: "Grupo",
  currencyLabel: "Moneda",
  expensesSection: "Gastos",
  paymentsSection: "Pagos",
  date: "Fecha",
  description: "Descripción",
  amount: "Monto",
  paidBy: "Pagó",
  from: "Pagó",
  to: "Recibió",
  noExpenses: "Sin gastos registrados.",
  noPayments: "Sin pagos registrados.",
};

function record<T extends object>(overrides: T) {
  return {
    id: "id",
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    version: 1,
    deleted_at: null,
    ...overrides,
  };
}

const group: Group = record({
  name: "Viaje",
  description: null,
  currency_code: "ARS",
  archived_at: null,
});

const ana: Participant = record({ id: "ana", group_id: group.id, name: "Ana" });
const beto: Participant = record({ id: "beto", group_id: group.id, name: "Beto" });

describe("buildGroupCsv", () => {
  it("arma las secciones de gastos y pagos con fecha desc y montos formateados", () => {
    const expenses: Expense[] = [
      record({
        id: "e1",
        group_id: group.id,
        description: "Cena, con coma",
        amount_minor_units: 30000,
        paid_by: ana.id,
        expense_date: "2026-09-01",
        split_strategy: { kind: "equal" },
      }),
      record({
        id: "e2",
        group_id: group.id,
        description: "Nafta",
        amount_minor_units: 5000,
        paid_by: beto.id,
        expense_date: "2026-09-03",
        split_strategy: { kind: "equal" },
      }),
    ];
    const payments: Payment[] = [
      record({
        id: "p1",
        group_id: group.id,
        from_participant: beto.id,
        to_participant: ana.id,
        amount_minor_units: 17500,
        payment_date: "2026-09-04",
      }),
    ];

    const csv = buildGroupCsv({
      group,
      participants: [ana, beto],
      expenses,
      shares: [],
      payments,
      lang: "es",
      labels,
    });

    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Grupo,Viaje");
    expect(lines[1]).toBe("Moneda,ARS");

    // El gasto del 3/9 (más reciente) va antes que el del 1/9.
    const expensesStart = lines.indexOf("Gastos");
    expect(lines[expensesStart + 2]).toContain("Nafta");
    expect(lines[expensesStart + 3]).toContain("Cena, con coma");
    // La descripción con coma queda entre comillas (CSV válido).
    expect(lines[expensesStart + 3]).toContain('"Cena, con coma"');
    expect(lines[expensesStart + 3]).toContain("Ana");

    const paymentsStart = lines.indexOf("Pagos");
    expect(lines[paymentsStart + 2]).toContain("Beto");
    expect(lines[paymentsStart + 2]).toContain("Ana");
  });

  it("avisa cuando no hay gastos o pagos, en vez de dejar la sección vacía", () => {
    const csv = buildGroupCsv({
      group,
      participants: [ana],
      expenses: [],
      shares: [],
      payments: [],
      lang: "es",
      labels,
    });
    expect(csv).toContain("Sin gastos registrados.");
    expect(csv).toContain("Sin pagos registrados.");
  });
});

describe("csvFileName", () => {
  it("arma un nombre de archivo seguro a partir del nombre del grupo", () => {
    expect(csvFileName("Viaje a Bariloche")).toBe("fivi-viaje-a-bariloche.csv");
    expect(csvFileName("Cena: ¡Épica! 🎉")).toBe("fivi-cena-épica.csv");
    expect(csvFileName("")).toBe("fivi-grupo.csv");
  });
});
