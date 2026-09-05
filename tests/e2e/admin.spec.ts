import { test, expect } from "@playwright/test";

/**
 * E2E del panel de administración en el build de e2e (SIN Supabase configurado).
 *
 * Verifica lo que no depende de credenciales:
 *  - los endpoints /api/admin/* rechazan a quien no está autenticado (401);
 *  - `/administracion` (ruta canónica) y sus subrutas quedan cerradas;
 *  - `/admin` (nombre viejo) redirige a `/administracion` conservando la query;
 *  - accesibilidad y responsive del login.
 *
 * El camino "usuario autenticado que no es admin -> denegado" necesita Supabase
 * y está cubierto por los tests unitarios de rutas y de RLS.
 */

const API_ENDPOINTS = [
  "/api/admin/me",
  "/api/admin/metrics",
  "/api/admin/users",
  "/api/admin/groups",
  "/api/admin/movimientos",
  "/api/admin/audit",
  "/api/admin/status",
  "/api/admin/settings",
  "/api/admin/feedback",
];

test("los endpoints admin responden 401 sin token", async ({ request }) => {
  for (const path of API_ENDPOINTS) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(401);
    expect(await res.json()).toHaveProperty("error");
  }
});

test("acciones admin (POST/PATCH) también exigen autenticación", async ({ request }) => {
  const uuid = "11111111-1111-1111-1111-111111111111";
  const ban = await request.post(`/api/admin/users/${uuid}/ban`, { data: { ban: true } });
  expect(ban.status()).toBe(401);
  const patch = await request.patch("/api/admin/settings", {
    data: { key: "default_currency", value: "USD" },
  });
  expect(patch.status()).toBe(401);

  const status = await request.post(`/api/admin/feedback/${uuid}/status`, {
    data: { status: "resolved" },
  });
  expect(status.status()).toBe(401);
});

test("acceso no autorizado a /administracion y sus subrutas: no exponen nada", async ({
  page,
}) => {
  for (const path of [
    "/administracion",
    "/administracion/usuarios",
    "/administracion/grupos",
    "/administracion/movimientos",
    "/administracion/auditoria",
    "/administracion/estado",
    "/administracion/configuracion",
    "/administracion/feedback",
  ]) {
    await page.goto(path);
    // Sin backend configurado el guard muestra "Panel no disponible" y NUNCA la
    // navegación del panel ni datos.
    await expect(page.getByRole("link", { name: "Usuarios" })).toHaveCount(0);
    await expect(page.getByRole("table")).toHaveCount(0);
  }
});

test("/admin redirige a /administracion (conserva la query)", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/administracion$/);

  await page.goto("/admin/login?k=llave-x");
  // La llave se procesa en /administracion/login y luego se limpia la URL.
  await expect(page).toHaveURL(/\/administracion/);

  await page.goto("/admin/usuarios");
  await expect(page).toHaveURL(/\/administracion\/usuarios$/);
});

test("/administracion/login pide la llave y no revela nada más", async ({ page }) => {
  await page.goto("/administracion/login");
  const field = page.getByLabel("Llave de acceso");
  await expect(field).toBeVisible();
  await expect(field).toHaveAttribute("type", "password");
  await expect(page.getByRole("button", { name: "Entrar" })).toBeDisabled();
  await expect(page.getByRole("link", { name: "Usuarios" })).toHaveCount(0);
});

test("login: navegación por teclado y foco visible", async ({ page }) => {
  await page.goto("/administracion/login");
  await page.getByLabel("Llave de acceso").focus();
  await expect(page.getByLabel("Llave de acceso")).toBeFocused();
  await page.keyboard.type("una-llave-cualquiera");
  await expect(page.getByRole("button", { name: "Entrar" })).toBeEnabled();
  // El foco se puede llevar al botón con Tab.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Entrar" })).toBeFocused();
});

for (const width of [320, 375, 768, 1024, 1440]) {
  test(`login sin desborde horizontal a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/administracion/login");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `scroll horizontal a ${width}px`).toBeLessThanOrEqual(1);
  });
}

test("una llave inventada no da acceso (el backend la rechaza)", async ({ page }) => {
  await page.goto("/administracion/login?k=llave-inventada-que-no-es-la-correcta");
  await page.waitForURL(/\/administracion$/);
  await expect(page.getByRole("link", { name: "Usuarios" })).toHaveCount(0);

  const res = await page.request.get("/api/admin/me", {
    headers: { authorization: "Bearer llave-inventada-que-no-es-la-correcta" },
  });
  expect([401, 503]).toContain(res.status());
  expect(await res.json()).toHaveProperty("error");
});
