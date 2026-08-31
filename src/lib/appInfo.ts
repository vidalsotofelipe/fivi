/**
 * Información de build de FIVI. Fuente única: `package.json` (versión) + el
 * entorno de build (commit y entorno los inyecta `next.config.mjs`).
 *
 * Nada se hardcodea acá: si las variables no están definidas (p. ej. en tests)
 * se cae en valores neutros. No hay datos sensibles: sólo versión, SHA corto y
 * el nombre del entorno.
 */

export interface AppInfo {
  version: string;
  commit: string;
  environment: string;
}

export const appInfo: AppInfo = {
  version: process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0",
  commit: process.env.NEXT_PUBLIC_APP_COMMIT ?? "unknown",
  environment: process.env.NEXT_PUBLIC_APP_ENV ?? "development",
};

/** Etiqueta corta para mostrar en la UI, p. ej. "v0.7.0 · a73f92c". */
export function versionLabel(info: AppInfo = appInfo): string {
  const commit =
    info.commit && info.commit !== "unknown" ? ` · ${info.commit}` : "";
  return `v${info.version}${commit}`;
}
