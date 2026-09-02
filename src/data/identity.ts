"use client";

/**
 * Identidad del usuario dentro de los grupos.
 *
 * El usuario dice **una vez** cómo se llama (`my_name`, preferencia global del
 * dispositivo) y a partir de ahí:
 *  - al crear un grupo se suma solo como participante y queda marcado como "yo";
 *  - al entrar a un grupo que ya existe (invitación, otro dispositivo), si hay
 *    un participante con ese nombre se lo reconoce solo.
 *
 * Sigue siendo por dispositivo: los participantes son nombres, no cuentas (ver
 * `docs/REDISENIO.md`). Esto sólo evita tener que elegir "quién sos" en cada
 * grupo.
 */
import { db, type FiviDatabase } from "./db";
import { getMyName } from "./settings";
import { meKey, setSetting } from "./settings";
import { addParticipant, listParticipants } from "./repositories/participantRepo";

/** Compara nombres como los escribiría una persona: sin acentos, caso ni espacios de más. */
export function sameName(a: string, b: string): boolean {
  const norm = (s: string) => {
    let out = "";
    for (const ch of s.normalize("NFD")) {
      const code = ch.codePointAt(0) ?? 0;
      if (code >= 0x0300 && code <= 0x036f) continue; // marcas diacríticas
      out += ch;
    }
    return out.trim().replace(/\s+/g, " ").toLowerCase();
  };
  return norm(a) === norm(b);
}

/**
 * Se asegura de que el usuario esté en el grupo y marcado como "yo".
 *
 * - Si ya hay un participante con su nombre, lo reutiliza (no duplica).
 * - Si no lo hay y `create` es `true`, lo agrega.
 * - Sin `my_name` configurado no hace nada.
 *
 * Devuelve el id del participante que representa al usuario, o `null`.
 */
export async function ensureMeInGroup(
  groupId: string,
  { create = false }: { create?: boolean } = {},
  database: FiviDatabase = db,
): Promise<string | null> {
  const myName = (await getMyName(database))?.trim();
  if (!myName) return null;

  const participants = await listParticipants(groupId, database);
  const existing = participants.find((p) => sameName(p.name, myName));

  if (existing) {
    await setSetting(meKey(groupId), existing.id, database);
    return existing.id;
  }
  if (!create) return null;

  const created = await addParticipant(groupId, myName, database);
  await setSetting(meKey(groupId), created.id, database);
  return created.id;
}

/**
 * Reconoce al usuario en los grupos donde todavía no eligió "quién sos" pero hay
 * un participante con su nombre. No crea participantes: sólo enlaza. Devuelve
 * los ids de grupo resueltos.
 */
export async function autoLinkMe(
  database: FiviDatabase = db,
): Promise<string[]> {
  const myName = (await getMyName(database))?.trim();
  if (!myName) return [];

  const groups = (await database.groups.toArray()).filter(
    (g) => g.deleted_at === null,
  );
  const linked: string[] = [];

  for (const g of groups) {
    const already = await database.settings.get(meKey(g.id));
    if (already?.value) continue;
    const participants = await listParticipants(g.id, database);
    const match = participants.find((p) => sameName(p.name, myName));
    if (match) {
      await setSetting(meKey(g.id), match.id, database);
      linked.push(g.id);
    }
  }
  return linked;
}
