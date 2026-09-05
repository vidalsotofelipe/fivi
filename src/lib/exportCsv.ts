/**
 * Exportar un grupo a CSV: gastos + pagos, con los montos y fechas
 * formateados igual que en pantalla (no números crudos) — pensado para que
 * una persona lo abra y lo lea, no para alimentar otro programa.
 *
 * Función pura (sin DOM, sin i18n embebido): recibe los datos ya resueltos y
 * las etiquetas ya traducidas, así se puede testear sin red ni navegador. El
 * disparo de la descarga (`Blob` + `<a download>`) vive en la pantalla que la
 * usa, no acá.
 */
import type {
  Expense,
  ExpenseParticipant,
  Group,
  Participant,
  Payment,
} from "@/domain/types";
import type { Lang } from "@/i18n/config";
import { formatDate, formatMoney } from "./format";

export interface ExportCsvLabels {
  groupLabel: string;
  currencyLabel: string;
  expensesSection: string;
  paymentsSection: string;
  date: string;
  description: string;
  amount: string;
  paidBy: string;
  from: string;
  to: string;
  noExpenses: string;
  noPayments: string;
}

export interface ExportGroupCsvInput {
  group: Group;
  participants: Participant[];
  expenses: Expense[];
  shares: ExpenseParticipant[];
  payments: Payment[];
  lang: Lang;
  labels: ExportCsvLabels;
}

function nameOf(participants: Participant[], id: string): string {
  return participants.find((p) => p.id === id)?.name ?? "—";
}

/** Encierra el valor entre comillas sólo si hace falta (coma, comilla o salto de línea). */
function csvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function csvRow(cells: string[]): string {
  return cells.map(csvCell).join(",");
}

/**
 * Arma el CSV completo: una fila de encabezado del grupo, la sección de
 * gastos y la sección de pagos, ordenados por fecha descendente igual que en
 * la app. `\r\n` como separador de línea (compatibilidad con Excel).
 */
export function buildGroupCsv(input: ExportGroupCsvInput): string {
  const { group, participants, expenses, shares, payments, lang, labels } = input;
  const cc = group.currency_code;
  const lines: string[] = [];

  lines.push(csvRow([labels.groupLabel, group.name]));
  lines.push(csvRow([labels.currencyLabel, cc]));
  lines.push("");

  lines.push(labels.expensesSection);
  lines.push(csvRow([labels.date, labels.description, labels.amount, labels.paidBy]));
  const sortedExpenses = [...expenses].sort((a, b) =>
    b.expense_date.localeCompare(a.expense_date),
  );
  if (sortedExpenses.length === 0) {
    lines.push(labels.noExpenses);
  } else {
    for (const e of sortedExpenses) {
      lines.push(
        csvRow([
          formatDate(e.expense_date, lang),
          e.description,
          formatMoney(e.amount_minor_units, cc, lang),
          nameOf(participants, e.paid_by),
        ]),
      );
    }
  }
  lines.push("");

  lines.push(labels.paymentsSection);
  lines.push(csvRow([labels.date, labels.from, labels.to, labels.amount]));
  const sortedPayments = [...payments].sort((a, b) =>
    b.payment_date.localeCompare(a.payment_date),
  );
  if (sortedPayments.length === 0) {
    lines.push(labels.noPayments);
  } else {
    for (const p of sortedPayments) {
      lines.push(
        csvRow([
          formatDate(p.payment_date, lang),
          nameOf(participants, p.from_participant),
          nameOf(participants, p.to_participant),
          formatMoney(p.amount_minor_units, cc, lang),
        ]),
      );
    }
  }

  void shares; // reservado para una futura columna de "reparto"; no usado en v1.
  return lines.join("\r\n");
}

/** Nombre de archivo sugerido: el nombre del grupo, sin caracteres problemáticos. */
export function csvFileName(groupName: string): string {
  const slug = groupName
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
  return `fivi-${slug || "grupo"}.csv`;
}
