import { test, expect } from "@playwright/test";

/**
 * Gestión de feedback en el panel admin, en el build de e2e (SIN Supabase
 * configurado).
 *
 * La llave de acceso (`ADMIN_ACCESS_KEY` en `playwright.config.ts`) SÍ
 * autentica sin necesitar Supabase (`requireAdmin` la valida en el propio
 * proceso, ver `src/lib/adminAuth.ts`), así que acá se puede probar el shell
 * autenticado de verdad: la sección "Feedback" en el nav, y que sin Supabase
 * configurado el listado y el detalle degradan con gracia (un estado de error
 * reintentable, nunca una pantalla en blanco ni un crash) en vez de asumir
 * que el shell entero se cae.
 *
 * El camino con datos reales (listar, abrir un detalle, cambiar el estado y
 * que persista) necesita Supabase de verdad y se verificó a mano contra
 * producción (ver CHANGELOG) — igual que el resto del panel admin.
 */

const ACCESS_KEY = "e2e-admin-key-0123456789abcdef";

async function loginWithKey(page: import("@playwright/test").Page) {
  await page.goto(`/administracion/login?k=${ACCESS_KEY}`);
  await page.waitForURL(/\/administracion$/);
}

test("con la llave de acceso, 'Feedback' aparece en el nav del panel", async ({
  page,
}) => {
  await loginWithKey(page);
  await expect(page.getByRole("link", { name: "Feedback" })).toBeVisible();
});

test("el listado de feedback degrada con gracia sin Supabase configurado", async ({
  page,
}) => {
  await loginWithKey(page);
  await page.getByRole("link", { name: "Feedback" }).click();
  await page.waitForURL(/\/administracion\/feedback$/);

  // Nunca una pantalla en blanco: un estado de error explícito y reintentable.
  await expect(page.getByText("No se pudo cargar")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reintentar" })).toBeVisible();
});

test("el detalle de un feedback degrada con gracia sin Supabase configurado", async ({
  page,
}) => {
  await loginWithKey(page);
  await page.goto("/administracion/feedback/11111111-1111-1111-1111-111111111111");
  await expect(page.getByText("No se pudo cargar")).toBeVisible();
});
