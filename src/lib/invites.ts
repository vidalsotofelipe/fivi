/**
 * Utilidades de tokens de invitación (Etapa 7).
 *
 * El enlace para sumarse a un grupo es `/join/<token>`, donde `<token>` es una
 * cadena aleatoria de 256 bits en base64url. El servidor **nunca** guarda el
 * token en claro: sólo el hash SHA-256 (`group_invites.token_hash`). Al canjear,
 * el cliente manda el token crudo a la RPC `redeem_group_invite`, que lo vuelve
 * a hashear y compara.
 *
 * Estas funciones son puras (sólo Web Crypto) y sirven tanto en el navegador
 * como en Node (tests): `globalThis.crypto.subtle` existe en ambos.
 */

const TOKEN_BYTES = 32; // 256 bits

/** base64 estándar -> base64url sin padding. */
function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Token de invitación nuevo: 32 bytes aleatorios en base64url (~43 chars). */
export function generateInviteToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

/** SHA-256 de los bytes UTF-8 del token. Igual que `sha256(convert_to(token,'UTF8'))` en Postgres. */
export async function hashInviteToken(token: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(digest);
}

/** Hex de los bytes, p. ej. "9f86d0...". */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Literal `bytea` para PostgREST/Supabase (`\x` + hex). Es lo que se inserta en
 * `group_invites.token_hash`.
 */
export async function hashInviteTokenBytea(token: string): Promise<string> {
  return "\\x" + toHex(await hashInviteToken(token));
}
