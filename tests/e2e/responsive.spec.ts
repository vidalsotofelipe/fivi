import { test, expect, type Page } from "@playwright/test";

/**
 * Sin scroll horizontal a nivel documento en ningún ancho de teléfono
 * habitual. Se recorren todas las rutas principales a 320 / 360 / 390 / 430 px.
 */

const WIDTHS = [320, 360, 390, 430];

async function noHorizontalScroll(page: Page, label: string) {
  // Espera a que el contenido monte (los pages son client-side).
  await page.waitForLoadState("networkidle");
  const { scrollW, clientW } = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  expect(
    scrollW,
    `${label}: scrollWidth ${scrollW} > clientWidth ${clientW}`,
  ).toBeLessThanOrEqual(clientW);
}

async function seedGroup(page: Page): Promise<string> {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/nuevo");
  await page.getByPlaceholder("Viaje a Bariloche").fill("Responsive E2E");
  await page.getByRole("combobox", { name: "Moneda" }).fill("ARS");
  await page.getByRole("button", { name: /ARS/ }).first().click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.waitForURL(/\/g\/[0-9a-f-]{36}\/nuevo\/personas$/);
  const id = page.url().split("/g/")[1]!.split("/")[0]!;

  for (const name of ["Ana", "Beto"]) {
    await page.getByPlaceholder("Ej.: Ana").fill(name);
    await page.getByRole("button", { name: "Agregar", exact: true }).click();
    await expect(
      page.getByRole("listitem").filter({ hasText: name }),
    ).toBeVisible();
  }
  await page.getByRole("button", { name: /Continuar con 2/ }).click();
  await page.waitForURL(/\/listo$/);
  await page.getByRole("button", { name: "Ir al resumen" }).click();
  await page.waitForURL(new RegExp(`/g/${id}$`));

  // Un gasto para que las pantallas de lista/balance/actividad tengan contenido.
  await page.goto(`/g/${id}/gastos/nuevo`);
  await page.getByPlaceholder("Cena, supermercado, Uber…").fill("Cena");
  await page.locator('input[inputmode="decimal"]').first().fill("4500");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Revisar gasto" }).click();
  await page.getByRole("button", { name: "Guardar gasto" }).click();
  await page.waitForURL(new RegExp(`/g/${id}$`));

  return id;
}

test("sin scroll horizontal en 320/360/390/430 px", async ({ page }) => {
  const id = await seedGroup(page);

  const routes = [
    "/",
    "/nuevo",
    `/g/${id}`,
    `/g/${id}/gastos`,
    `/g/${id}/gastos/nuevo`,
    `/g/${id}/balance`,
    `/g/${id}/pagos/nuevo`,
    `/g/${id}/personas`,
    `/g/${id}/actividad`,
    `/g/${id}/mas`,
    `/g/${id}/config`,
  ];

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    for (const route of routes) {
      await page.goto(route);
      await noHorizontalScroll(page, `${route} @ ${width}px`);
    }
  }
});
