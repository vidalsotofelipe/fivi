/**
 * Llave de acceso del panel (etapa previa a la autenticación de administradores).
 *
 * Se guarda en `localStorage` de este navegador y viaja como `Authorization:
 * Bearer <llave>` hacia `/api/admin/*`, donde se compara contra la variable
 * server-only `ADMIN_ACCESS_KEY`. Es un secreto compartido, NO una identidad:
 * quien la tenga entra. Se reemplaza por email+contraseña en la etapa 2.
 */
export const ADMIN_KEY_STORAGE = "fivi:admin-key";

export function readAdminKey(): string | null {
  try {
    const v = window.localStorage.getItem(ADMIN_KEY_STORAGE);
    return v && v.trim() !== "" ? v : null;
  } catch {
    return null; // storage bloqueado (modo privado, etc.)
  }
}

export function writeAdminKey(key: string | null): void {
  try {
    if (key) window.localStorage.setItem(ADMIN_KEY_STORAGE, key);
    else window.localStorage.removeItem(ADMIN_KEY_STORAGE);
  } catch {
    /* sin persistencia: hay que volver a entrar con el enlace */
  }
}
