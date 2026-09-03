/**
 * Validación de la configuración del panel, compartida entre el cliente
 * (Configuración) y el servidor (`/api/admin/settings`). Sin dependencias de
 * runtime: sólo funciones puras.
 */

/**
 * Nombre de feature flag: empieza por letra minúscula, sigue con
 * `[a-z0-9_.]`, entre 2 y 40 caracteres. Evita colisiones raras y nombres que
 * no se puedan usar como clave en el cliente.
 */
export const FLAG_NAME_RE = /^[a-z][a-z0-9_.]{1,39}$/;

export const FLAG_NAME_HELP =
  'Minúsculas, números, "_" o ".", empezando por letra (2–40 caracteres). Ej.: nuevo_onboarding, pagos.beta';

/** `null` si el nombre es válido; si no, el mensaje a mostrar. */
export function flagNameError(name: string): string | null {
  return FLAG_NAME_RE.test(name) ? null : FLAG_NAME_HELP;
}
