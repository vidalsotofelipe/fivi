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

test("/admin/login pide la llave de acceso y no revela nada más", async ({ page }) => {
  await page.goto("/admin/login");
  await expect(page.getByLabel("Llave de acceso")).toBeVisible();
  // El campo es de tipo password: la llave no queda a la vista.
  await expect(page.getByLabel("Llave de acceso")).toHaveAttribute(
    "type",
    "password",
  );
  // Sin llave no se entra: "Entrar" está deshabilitado y no hay panel.
  await expect(page.getByRole("button", { name: "Entrar" })).toBeDisabled();
  await expect(page.getByRole("link", { name: "Usuarios" })).toHaveCount(0);
});

test("una llave inventada no da acceso (el backend la rechaza)", async ({
  page,
}) => {
  // La llave se guarda en el navegador, pero la verificación es del servidor:
  // sin ADMIN_ACCESS_KEY correcto, /api/admin/* responde 401.
  await page.goto("/admin/login?k=llave-inventada-que-no-es-la-correcta");
  await page.waitForURL(/\/admin$/);
  await expect(page.getByRole("link", { name: "Usuarios" })).toHaveCount(0);

  const res = await page.request.get("/api/admin/me", {
    headers: { authorization: "Bearer llave-inventada-que-no-es-la-correcta" },
  });
  // 401 si la llave no coincide; 503 en este build, que además corre sin
  // service-role. Nunca 200: no hay forma de entrar con una llave inventada.
  expect([401, 503]).toContain(res.status());
  expect(await res.json()).toHaveProperty("error");
});
