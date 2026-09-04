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
  // Ruta canónica del panel: `/administracion`. `/admin` (nombre viejo) redirige
  // conservando la query (`?k=…` para la llave de acceso). Los endpoints siguen
  // en `/api/admin/*` (backend, protegidos por `requireAdmin` en cada uno).
  async redirects() {
    return [
      { source: "/admin", destination: "/administracion", permanent: true },
      {
        source: "/admin/:path*",
        destination: "/administracion/:path*",
        permanent: true,
      },
    ];
  },
  // Nada administrativo se guarda en ningún cache: navegador, CDN, proxies ni
  // Service Worker. `Vary: Authorization` impide además reutilizar una respuesta
  // obtenida con credenciales para un pedido que no las trae. Los Route Handlers
  // ya lo ponen (ver `lib/adminHandler`); esto cubre también las PÁGINAS del
  // panel y cualquier ruta futura que se olvide de hacerlo.
  async headers() {
    const noStore = [
      { key: "Cache-Control", value: "private, no-store" },
      { key: "Vary", value: "Authorization" },
    ];
    return [
      { source: "/administracion", headers: noStore },
      { source: "/administracion/:path*", headers: noStore },
      { source: "/api/admin/:path*", headers: noStore },
    ];
  },
};

export default nextConfig;
