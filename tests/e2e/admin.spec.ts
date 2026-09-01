import { test, expect } from "@playwright/test";

/**
 * E2E del panel admin en el build de e2e (SIN Supabase configurado).
 *
 * Verifica lo que no depende de credenciales:
 *  - los endpoints /api/admin/* rechazan a quien no está autenticado (401);
 *  - la UI de /admin queda cerrada (no expone datos ni la app).
 *
 * El camino "usuario autenticado que no es admin -> denegado" necesita Supabase
 * y está cubierto por los tests unitarios de rutas y de RLS.
 */

test("los endpoints admin responden 401 sin token", async ({ request }) => {
  for (const path of [
    "/api/admin/me",
    "/api/admin/metrics",
    "/api/admin/users",
    "/api/admin/groups",
    "/api/admin/movimientos",
    "/api/admin/audit",
    "/api/admin/status",
    "/api/admin/settings",
  ]) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  }
});

test("acciones admin (POST) también exigen autenticación", async ({ request }) => {
  const uuid = "11111111-1111-1111-1111-111111111111";
  const ban = await request.post(`/api/admin/users/${uuid}/ban`, { data: { ban: true } });
  expect(ban.status()).toBe(401);
  const patch = await request.patch("/api/admin/settings", {
    data: { key: "default_currency", value: "USD" },
  });
  expect(patch.status()).toBe(401);
});

test("/admin no expone el panel sin backend configurado", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByText("Panel no disponible")).toBeVisible();
  // No hay navegación del panel ni datos.
  await expect(page.getByRole("link", { name: "Usuarios" })).toHaveCount(0);
});

test("/admin/login informa que el panel no está configurado", async ({ page }) => {
  await page.goto("/admin/login");
  await expect(page.getByText(/no está configurado/i)).toBeVisible();
});
