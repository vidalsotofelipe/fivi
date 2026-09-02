"use client";

/**
 * Preferencias locales por dispositivo, sobre el store `settings` de Dexie
 * (`{ key, value }`). No se sincronizan: son de este dispositivo.
 *
 *  - `me:<groupId>`         id del participante que sos vos en ese grupo
 *  - `last_payer:<groupId>` último pagador elegido al cargar un gasto
 *  - `setup_seen:<groupId>` la pantalla "grupo listo" ya se mostró
 *  - `lang`                 idioma (lo maneja i18n; acá sólo por consistencia)
 */
import { useLiveQuery } from "dexie-react-hooks";
import { db, type FiviDatabase } from "./db";

export async function getSetting<T = unknown>(
  key: string,
  database: FiviDatabase = db,
): Promise<T | undefined> {
  const row = await database.settings.get(key);
  return row?.value as T | undefined;
}

export async function setSetting(
  key: string,
  value: unknown,
  database: FiviDatabase = db,
): Promise<void> {
  await database.settings.put({ key, value });
}

export async function removeSetting(
  key: string,
  database: FiviDatabase = db,
): Promise<void> {
  await database.settings.delete(key);
}

/** Reactivo: `undefined` mientras carga, luego el valor o `null` si no existe. */
export function useSetting<T = unknown>(key: string): T | null | undefined {
  return useLiveQuery(
    async () => {
      const row = await db.settings.get(key);
      return (row?.value as T) ?? null;
    },
    [key],
  );
}

// Preferencias globales del dispositivo ------------------------------------
/**
 * Cómo se llama el usuario de este dispositivo. Se usa para sumarse solo a los
 * grupos que crea y para reconocerse ("quién sos") en los que ya existen, sin
 * tener que elegirlo grupo por grupo.
 */
export const MY_NAME_KEY = "my_name";

export function getMyName(database: FiviDatabase = db): Promise<string | undefined> {
  return getSetting<string>(MY_NAME_KEY, database);
}

export function setMyName(name: string, database: FiviDatabase = db): Promise<void> {
  return setSetting(MY_NAME_KEY, name.trim(), database);
}

/** Reactivo: `undefined` cargando · `null` si nunca se indicó. */
export function useMyName(): string | null | undefined {
  return useSetting<string>(MY_NAME_KEY);
}

/** Última moneda que el usuario eligió a mano al crear un grupo. */
export const LAST_CURRENCY_KEY = "last_currency";

export function getLastCurrency(database: FiviDatabase = db): Promise<string | undefined> {
  return getSetting<string>(LAST_CURRENCY_KEY, database);
}

export function rememberLastCurrency(code: string, database: FiviDatabase = db): Promise<void> {
  return setSetting(LAST_CURRENCY_KEY, code, database);
}

// Claves con scope de grupo -------------------------------------------------
export const meKey = (groupId: string) => `me:${groupId}`;
export const lastPayerKey = (groupId: string) => `last_payer:${groupId}`;
export const setupSeenKey = (groupId: string) => `setup_seen:${groupId}`;

/** id del participante que sos vos en este grupo (o `null` si no elegiste). */
export function useMe(groupId: string): string | null | undefined {
  return useSetting<string>(meKey(groupId));
}

export function setMe(groupId: string, participantId: string | null) {
  return participantId === null
    ? removeSetting(meKey(groupId))
    : setSetting(meKey(groupId), participantId);
}

export function useLastPayer(groupId: string): string | null | undefined {
  return useSetting<string>(lastPayerKey(groupId));
}

export function rememberLastPayer(groupId: string, participantId: string) {
  return setSetting(lastPayerKey(groupId), participantId);
}
