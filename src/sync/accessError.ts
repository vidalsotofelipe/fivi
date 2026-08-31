/**
 * Detección y mensaje de "error de acceso" para la sincronización (Etapa 7).
 *
 * Con RLS activo, si el usuario ya no es miembro de un grupo (o su sesión no es
 * válida) el servidor rechaza los push de ese grupo. Ese rechazo **no** debe
 * borrar el cambio local: se marca, se informa y el dato queda hasta que el
 * usuario decida. Este módulo no importa `@supabase/supabase-js` para poder
 * usarse desde el motor y desde los tests sin arrastrar la librería.
 */

/** Mensaje que ve el usuario cuando un cambio se rechaza por falta de acceso. */
export const ACCESS_DENIED_MESSAGE =
  "Sin acceso al grupo: es posible que ya no seas miembro. Tus cambios locales se conservan.";

interface RemoteErrorLike {
  code?: string | null;
  message?: string | null;
}

/**
 * `true` si el error de Postgres/PostgREST es por permisos/JWT y no por un
 * problema transitorio de red o de datos.
 *  - `42501`: insufficient_privilege (violación de RLS).
 *  - `PGRST301` / `PGRST302`: JWT ausente, inválido o expirado.
 */
export function isAccessError(error: RemoteErrorLike | null | undefined): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  if (code === "42501" || code === "PGRST301" || code === "PGRST302") return true;
  const msg = error.message ?? "";
  return /row-level security|permission denied|not authorized|JWT/i.test(msg);
}
