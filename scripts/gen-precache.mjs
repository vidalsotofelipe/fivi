/**
 * Genera `public/precache.json` con la lista de assets estáticos del build
 * (`/_next/static/**`: chunks JS, CSS, y los manifests que Next emite). El
 * Service Worker los precachea en `install`, así toda la app web funciona sin
 * conexión aunque el usuario nunca haya visitado esa ruta.
 *
 * Corre después de `next build` (ver package.json). Best-effort: si no hay
 * `.next/static` (p. ej. en un entorno de test), escribe una lista vacía.
 */
import { readdirSync, statSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, posix } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const staticDir = join(root, ".next", "static");
const out = join(root, "public", "precache.json");

/** Extensiones que sirve el navegador y conviene tener offline. */
const KEEP = new Set([".js", ".css", ".woff2", ".woff"]);

function walk(dir, base) {
  const entries = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = posix.join(base, name);
    if (statSync(full).isDirectory()) entries.push(...walk(full, rel));
    else if (KEEP.has(name.slice(name.lastIndexOf(".")))) {
      entries.push(`/_next/static/${rel}`);
    }
  }
  return entries;
}

let list = [];
if (existsSync(staticDir)) {
  list = walk(staticDir, "");
  // No precachear los source maps ni los archivos enormes (>2 MB).
  list = list.filter((u) => !u.endsWith(".map"));
}

if (!existsSync(join(root, "public"))) mkdirSync(join(root, "public"));
writeFileSync(out, JSON.stringify(list));
console.log(`[precache] ${list.length} assets → public/precache.json`);
