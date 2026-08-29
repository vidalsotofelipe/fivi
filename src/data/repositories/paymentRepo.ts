/**
 * Repositorio de pagos entre participantes (sección 9 del documento).
 *
 * Registrar que una persona le pagó a otra. Al hacerlo, los balances y las
 * transferencias sugeridas se recalculan (el recálculo es responsabilidad de
 * la capa de dominio a partir de estos datos).
 */

import type { IsoDate, Payment } from "@/domain/types";
import { FiviDatabase, db as defaultDb } from "../db";
import { createRecord, isLive, softDeleteRecord } from "./base";
import { nowIso } from "../ids";

export interface CreatePaymentInput {
  group_id: string;
  from_participant: string;
  to_participant: string;
  amount_minor_units: number;
  payment_date?: IsoDate;
}

export async function createPayment(
  input: CreatePaymentInput,
  database: FiviDatabase = defaultDb,
): Promise<Payment> {
  if (input.from_participant === input.to_participant) {
    throw new Error("El pago debe ser entre dos personas distintas");
  }
  if (
    !Number.isInteger(input.amount_minor_units) ||
    input.amount_minor_units <= 0
  ) {
    throw new Error("El monto del pago debe ser un entero positivo");
  }
  return createRecord<Payment>(
    database.payments,
    "payment",
    {
      group_id: input.group_id,
      from_participant: input.from_participant,
      to_participant: input.to_participant,
      amount_minor_units: input.amount_minor_units,
      payment_date: input.payment_date ?? nowIso().slice(0, 10),
    },
    database,
  );
}

export async function listPayments(
  groupId: string,
  database: FiviDatabase = defaultDb,
): Promise<Payment[]> {
  const rows = await database.payments
    .where("group_id")
    .equals(groupId)
    .toArray();
  return rows
    .filter(isLive)
    .sort((a, b) => b.payment_date.localeCompare(a.payment_date));
}

export async function deletePayment(
  id: string,
  database: FiviDatabase = defaultDb,
): Promise<Payment> {
  return softDeleteRecord<Payment>(database.payments, "payment", id, database);
}
