/**
 * Repositorio de participantes (sección 3 del documento).
 *
 * Un participante se agrega sólo con su nombre. No necesita cuenta. El id se
 * genera localmente (UUID).
 */

import type { Participant } from "@/domain/types";
import { FiviDatabase, db as defaultDb } from "../db";
import {
  createRecord,
  isLive,
  softDeleteRecord,
  updateRecord,
} from "./base";

export async function addParticipant(
  groupId: string,
  name: string,
  database: FiviDatabase = defaultDb,
): Promise<Participant> {
  const clean = name.trim();
  if (!clean) throw new Error("El nombre del participante es obligatorio");
  return createRecord<Participant>(
    database.participants,
    "participant",
    { group_id: groupId, name: clean },
    database,
  );
}

export async function listParticipants(
  groupId: string,
  database: FiviDatabase = defaultDb,
): Promise<Participant[]> {
  const rows = await database.participants
    .where("group_id")
    .equals(groupId)
    .toArray();
  return rows.filter(isLive).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * TODOS los participantes que alguna vez estuvieron en el grupo, incluidos los
 * quitados (tombstones).
 *
 * Quitar a alguien es un soft delete: sus gastos y pagos **siguen contando en
 * los saldos** (así lo dice la confirmación). Para poder mostrar su nombre en
 * balances, "quién le debe a quién" y la actividad hace falta esta lista; con
 * `listParticipants` esas filas quedaban como "—".
 *
 * Para elegir personas (checkboxes, selectores) se sigue usando la lista viva.
 */
export async function listAllParticipants(
  groupId: string,
  database: FiviDatabase = defaultDb,
): Promise<Participant[]> {
  const rows = await database.participants
    .where("group_id")
    .equals(groupId)
    .toArray();
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export async function renameParticipant(
  id: string,
  name: string,
  database: FiviDatabase = defaultDb,
): Promise<Participant> {
  const clean = name.trim();
  if (!clean) throw new Error("El nombre del participante es obligatorio");
  return updateRecord<Participant>(
    database.participants,
    "participant",
    id,
    { name: clean },
    database,
  );
}

export async function removeParticipant(
  id: string,
  database: FiviDatabase = defaultDb,
): Promise<Participant> {
  return softDeleteRecord<Participant>(
    database.participants,
    "participant",
    id,
    database,
  );
}
