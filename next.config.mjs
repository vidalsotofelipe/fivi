import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Hay otro lockfile en el home del usuario; fijamos la raíz a este proyecto.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
