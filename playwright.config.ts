import { defineConfig, devices } from "@playwright/test";

/**
 * E2E de fivi. Corre contra la app compilada (`next start`) SIN Supabase:
 * `NEXT_PUBLIC_SUPABASE_*` no se define, así que la app funciona 100% local
 * (IndexedDB) y los tests no necesitan backend ni credenciales.
 */
const PORT = 3100;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    // fivi usa el idioma del navegador cuando no hay preferencia guardada.
    // Emulamos un usuario en español (idioma por defecto de la app) para que
    // los selectores por texto ES sean estables. El test de i18n cambia el
    // idioma explícitamente desde la UI.
    locale: "es-AR",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      NEXT_TELEMETRY_DISABLED: "1",
      // Sin credenciales de Supabase a propósito.
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      // Sin registro AUTOMÁTICO del service worker: navegación determinista
      // entre pasos del test. `/sw.js` se sigue sirviendo, así que el test de
      // caché (`sw-admin.spec.ts`) lo registra a mano cuando lo necesita.
      NEXT_PUBLIC_DISABLE_SW: "1",
      // Llave de acceso del panel, sólo para el test de caché administrativa:
      // permite obtener un 200 real de `/api/admin/me` (que no necesita
      // Supabase) y verificar que esa respuesta NO queda en Cache Storage.
      ADMIN_ACCESS_KEY: "e2e-admin-key-0123456789abcdef",
    },
  },
});
