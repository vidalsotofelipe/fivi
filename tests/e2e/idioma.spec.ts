import { test, expect, type Page } from "@playwright/test";

/**
 * Selector de idioma en Ajustes generales (ícono ⚙, siempre presente). Cambia
 * la interfaz al instante (sin recarga) y persiste entre recargas. La moneda
 * del grupo no cambia con el idioma. Antes vivía duplicado también en
 * Más → Configuración; se sacó de ahí porque es una preferencia del
 * dispositivo, no del grupo.
 */

async function seedGroup(page: Page): Promise<string> {
  await page.goto("/nuevo");
  await page.getByPlaceholder("Viaje a Bariloche").fill("Idioma E2E");
  await page.getByLabel("Moneda").selectOption("ARS");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.waitForURL(/\/g\/[0-9a-f-]{36}\/nuevo\/personas$/);
  const id = page.url().split("/g/")[1]!.split("/")[0]!;
  await page.getByPlaceholder("Ej.: Ana").fill("Ana");
  await page.getByRole("button", { name: "Agregar", exact: true }).click();
  await expect(
    page.getByRole("listitem").filter({ hasText: "Ana" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Continuar con 1/ }).click();
  await page.waitForURL(/\/listo$/);
  await page.getByRole("button", { name: "Ir al resumen" }).click();
  await page.waitForURL(new RegExp(`/g/${id}$`));
  return id;
}

test("cambio de idioma instantáneo y persistente", async ({ page }) => {
  const id = await seedGroup(page);

  // Español por defecto: la navegación inferior está en español.
  await page.goto(`/g/${id}/mas`);
  await expect(
    page.getByRole("link", { name: "Resumen" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");

  // Ajustes generales (⚙, siempre presente) → Idioma → English.
  await page.getByRole("link", { name: "Ajustes generales" }).click();
  await page.waitForURL(/\/ajustes$/);
  await page.getByRole("tab", { name: "English" }).click();

  // Cambia al instante, sin recarga.
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("heading", { name: "General settings" }),
  ).toBeVisible();

  // La moneda del grupo NO cambió con el idioma: el selector de Configuración
  // (del grupo, no de Ajustes) sigue en ARS.
  await page.goto(`/g/${id}/config`);
  await expect(
    page.getByRole("heading", { name: "Group details" }),
  ).toBeVisible();
  await expect(page.getByLabel("Currency")).toHaveValue("ARS");

  // La navegación inferior también quedó en inglés.
  await page.goto(`/g/${id}/mas`);
  await expect(page.getByRole("link", { name: "Summary" })).toBeVisible();
  await expect(page.getByRole("link", { name: "People" })).toBeVisible();

  // Persiste tras recargar.
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("link", { name: "More" })).toBeVisible();

  // Volver a español desde Ajustes generales (ya en inglés: "General
  // settings").
  await page.getByRole("link", { name: "General settings" }).click();
  await page.waitForURL(/\/ajustes$/);
  await page.getByRole("tab", { name: "Español" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(
    page.getByRole("heading", { name: "Ajustes generales" }),
  ).toBeVisible();
});

test("tema Sistema / Claro / Oscuro: cambio instantáneo y persistente", async ({
  page,
}) => {
  await seedGroup(page);
  await page.goto("/ajustes");

  const html = page.locator("html");
  // Por defecto: "Sistema" → sin data-theme.
  await expect(html).not.toHaveAttribute("data-theme", /.+/);

  // Oscuro.
  await page.getByRole("tab", { name: "Oscuro" }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    "#191816",
  );

  // Persiste tras recargar (script en <head>, antes del paint).
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");

  // Claro.
  await page.getByRole("tab", { name: "Claro" }).click();
  await expect(html).toHaveAttribute("data-theme", "light");

  // Volver a Sistema quita el atributo.
  await page.getByRole("tab", { name: "Sistema" }).click();
  await expect(html).not.toHaveAttribute("data-theme", /.+/);
});
