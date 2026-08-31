"use client";

import { appInfo, versionLabel } from "@/lib/appInfo";

/**
 * "Acerca de" discreto: FIVI + versión (y commit corto si está disponible).
 * Se muestra al pie de la pantalla inicial. La versión sale de `package.json`
 * vía `appInfo` (ver `next.config.mjs`), no se repite a mano en ningún lado.
 */
export function AppVersion() {
  const showEnv =
    appInfo.environment && appInfo.environment !== "production";

  return (
    <footer className="mt-auto pt-6 text-center text-xs opacity-40">
      <span className="font-medium">FIVI</span> {versionLabel()}
      {showEnv ? ` · ${appInfo.environment}` : null}
    </footer>
  );
}
