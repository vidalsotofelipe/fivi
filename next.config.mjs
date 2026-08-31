import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Información de build (una sola fuente de verdad) ------------------------
// Versión: siempre desde package.json.
const { version } = JSON.parse(
  readFileSync(join(__dirname, "package.json"), "utf8"),
);

// Commit corto: lo da Vercel en build; localmente se lee de git; si no hay
// ninguno (build en un tarball sin .git) queda "unknown". No expone nada
// sensible: sólo el SHA corto.
function shortCommit() {
  const fromCI =
    process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || "";
  if (fromCI) return fromCI.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD", {
      cwd: __dirname,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

// Entorno: production | preview | development. No es información sensible.
const environment =
  process.env.VERCEL_ENV || process.env.NODE_ENV || "development";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Hay otro lockfile en el home del usuario; fijamos la raíz a este proyecto.
  outputFileTracingRoot: __dirname,
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_APP_COMMIT: shortCommit(),
    NEXT_PUBLIC_APP_ENV: environment,
  },
};

export default nextConfig;
