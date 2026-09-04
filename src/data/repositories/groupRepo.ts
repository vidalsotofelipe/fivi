/**
 * Repositorio de grupos (secciones 1, 2, 30 del documento).
 *
 * La moneda del grupo es obligatoria al crear y sólo puede cambiarse mientras
 * el grupo no tenga gastos ni pagos.
 */

import type { CurrencyCode, Group } from "@/domain/types";
import { getCurrencyInfo } from "@/domain/currencies";
import {
  checkLength,
  GROUP_DESCRIPTION_MAX,
  GROUP_NAME_MAX,
} from "@/domain/limits";
import { FiviDatabase, db as defaultDb } from "../db";
import { nowIso } from "../ids";
import {
  createRecord,
  isLive,
  softDeleteRecord,
  updateRecord,
} from "./base";

export interface CreateGroupInput {
  name: string;
  description?: string | null;
  currency_code: CurrencyCode;
}

export async function createGroup(
  input: CreateGroupInput,
  database: FiviDatabase = defaultDb,
): Promise<Group> {
  const name = checkLength(input.name, "group_name", GROUP_NAME_MAX);
  if (!name) throw new Error("El nombre del grupo es obligatorio");
  if (!input.currency_code) throw new Error("La moneda del grupo es obligatoria");
  // Valida que la moneda sea reconocible (no lanza si es un ISO desconocido,
  // pero deja registro del fallback).
  getCurrencyInfo(input.currency_code);

  return createRecord<Group>(
    database.groups,
    "group",
    {
      name,
      description:
        checkLength(
          input.description ?? "",
          "group_description",
          GROUP_DESCRIPTION_MAX,
        ) || null,
      currency_code: input.currency_code,
      archived_at: null,
    },
    database,
  );
}

export async function getGroup(
  id: string,
  database: FiviDatabase = defaultDb,
): Promise<Group | undefined> {
  const g = await database.groups.get(id);
  return g && isLive(g) ? g : undefined;
}

export interface ListGroupsOptions {
  /** Incluir los grupos archivados (por defecto se excluyen). */
  includeArchived?: boolean;
  /** Devolver SÓLO los archivados. */
  onlyArchived?: boolean;
}

export async function listGroups(
  database: FiviDatabase = defaultDb,
  { includeArchived = false, onlyArchived = false }: ListGroupsOptions = {},
): Promise<Group[]> {
  const all = await database.groups.toArray();
  return all
    .filter(isLive)
    .filter((g) =>
      onlyArchived
        ? g.archived_at !== null
        : includeArchived || g.archived_at === null,
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Archiva el grupo: sale de la lista principal, se conserva y se puede restaurar. */
export async function archiveGroup(
  id: string,
  database: FiviDatabase = defaultDb,
): Promise<Group> {
  return updateRecord<Group>(
    database.groups,
    "group",
    id,
    { archived_at: nowIso() },
    database,
  );
}

/** Restaura un grupo archivado. */
export async function restoreGroup(
  id: string,
  database: FiviDatabase = defaultDb,
): Promise<Group> {
  return updateRecord<Group>(
    database.groups,
    "group",
    id,
    { archived_at: null },
    database,
  );
}

export async function renameGroup(
  id: string,
  patch: { name?: string; description?: string | null },
  database: FiviDatabase = defaultDb,
): Promise<Group> {
  const next: { name?: string; description?: string | null } = {};
  if (patch.name !== undefined) {
    const name = checkLength(patch.name, "group_name", GROUP_NAME_MAX);
    if (!name) throw new Error("El nombre del grupo es obligatorio");
    next.name = name;
  }
  if (patch.description !== undefined) {
    next.description =
      checkLength(
        patch.description ?? "",
        "group_description",
        GROUP_DESCRIPTION_MAX,
      ) || null;
  }
  return updateRecord<Group>(database.groups, "group", id, next, database);
}

/** True si el grupo ya tiene movimientos monetarios (gastos o pagos vivos). */
export async function groupHasMovements(
  groupId: string,
  database: FiviDatabase = defaultDb,
): Promise<boolean> {
  const expense = await database.expenses
    .where("group_id")
    .equals(groupId)
    .filter(isLive)
    .first();
  if (expense) return true;
  const payment = await database.payments
    .where("group_id")
    .equals(groupId)
    .filter(isLive)
    .first();
  return Boolean(payment);
}

/**
 * Cambia la moneda del grupo. Sólo permitido si todavía no hay gastos ni pagos
 * (sección 30). Con movimientos registrados lanza un error con el mensaje que
 * la UI debe mostrar.
 */
export async function changeGroupCurrency(
  id: string,
  currency_code: CurrencyCode,
  database: FiviDatabase = defaultDb,
): Promise<Group> {
  if (await groupHasMovements(id, database)) {
    throw new Error(
      "La moneda no puede modificarse porque este grupo ya tiene movimientos registrados.",
    );
  }
  return updateRecord<Group>(
    database.groups,
    "group",
    id,
    { currency_code },
    database,
  );
}

export async function deleteGroup(
  id: string,
  database: FiviDatabase = defaultDb,
): Promise<Group> {
  return softDeleteRecord<Group>(database.groups, "group", id, database);
}
