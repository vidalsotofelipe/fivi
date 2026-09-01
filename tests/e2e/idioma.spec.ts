import { test, expect, type Page } from "@playwright/test";

/**
 * Selector de idioma en Más → Configuración → Idioma. Cambia la interfaz al
 * instante (sin recarga) y persiste entre recargas. La moneda del grupo no
 * cambia con el idioma.
 */

async function seedGroup(page: Page): Promise<string> {
  await page.goto("/nuevo");
  await page.getByPlaceholder("Viaje a Bariloche").fill("Idioma E2E");
  await page.getByRole("combobox", { name: "Moneda" }).fill("ARS");
  await page.getByRole("button", { name: /ARS/ }).first().click();
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

  // Más → Configuración → Idioma → English.
  await page.getByRole("link", { name: "Configuración" }).click();
  await page.waitForURL(/\/config$/);
  await page.getByRole("tab", { name: "English" }).click();

  // Cambia al instante, sin recarga.
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("heading", { name: "Group details" }),
  ).toBeVisible();
  // La moneda del grupo NO cambió con el idioma: el selector sigue en ARS.
  await expect(page.getByRole("combobox", { name: "Currency" })).toBeVisible();
  await expect(page.getByText(/^ARS —/)).toBeVisible();

  // La navegación inferior también quedó en inglés.
  await page.goto(`/g/${id}/mas`);
  await expect(page.getByRole("link", { name: "Summary" })).toBeVisible();
  await expect(page.getByRole("link", { name: "People" })).toBeVisible();

  // Persiste tras recargar.
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("link", { name: "More" })).toBeVisible();

  // Volver a español desde Configuración.
  await page.getByRole("link", { name: "Settings" }).click();
  await page.waitForURL(/\/config$/);
  await page.getByRole("tab", { name: "Español" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(
    page.getByRole("heading", { name: "Datos del grupo" }),
  ).toBeVisible();
});

test("tema Sistema / Claro / Oscuro: cambio instantáneo y persistente", async ({
  page,
}) => {
  const id = await seedGroup(page);
  await page.goto(`/g/${id}/config`);

  const html = page.locator("html");
  // Por defecto: "Sistema" → sin data-theme.
  await expect(html).not.toHaveAttribute("data-theme", /.+/);

  // Oscuro.
  await page.getByRole("tab", { name: "Oscuro" }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    "#17161a",
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
