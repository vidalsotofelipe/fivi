import { test, expect } from "@playwright/test";

/**
 * Menú general de la app (idioma, apariencia) desde la pantalla de inicio.
 *
 * Antes esas dos preferencias —device-level, no de un grupo— sólo se podían
 * cambiar entrando a un grupo y abriendo su Configuración. El ícono ⚙ arriba a
 * la derecha del inicio lleva a `/ajustes`, accesible sin tener ningún grupo.
 */

test("el ícono de ajustes lleva a /ajustes, incluso sin grupos creados", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Ajustes" }).click();
  await page.waitForURL(/\/ajustes$/);
  await expect(
    page.getByRole("heading", { name: "Ajustes generales" }),
  ).toBeVisible();
});

test("cambiar el idioma desde /ajustes se aplica al instante y persiste", async ({
  page,
}) => {
  await page.goto("/ajustes");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");

  await page.getByRole("tab", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("heading", { name: "General settings" }),
  ).toBeVisible();

  // Persiste tras recargar, y también fuera de /ajustes (es global, no de un
  // grupo): el inicio queda en inglés.
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
});

test("cambiar la apariencia desde /ajustes se aplica al instante", async ({
  page,
}) => {
  await page.goto("/ajustes");
  const html = page.locator("html");
  await expect(html).not.toHaveAttribute("data-theme", /.+/);

  await page.getByRole("tab", { name: "Oscuro" }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");

  await page.getByRole("tab", { name: "Claro" }).click();
  await expect(html).toHaveAttribute("data-theme", "light");
});

test("sin desborde horizontal en /ajustes a 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/ajustes");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});
