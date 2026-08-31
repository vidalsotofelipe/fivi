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

// Claves con scope de grupo -------------------------------------------------
export const meKey = (groupId: string) => `me:${groupId}`;
export const lastPayerKey = (groupId: string) => `last_payer:${groupId}`;
export const setupSeenKey = (groupId: string) => `setup_seen:${groupId}`;
