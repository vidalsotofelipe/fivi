import { test, expect, type Page } from "@playwright/test";

/**
 * Cómo se leen los montos que escribe la gente.
 *
 * El bug de v0.16.4: el separador decimal salía del locale de la MONEDA, así que
 * con la app en español y un grupo en dólares, "10,50" se guardaba como
 * US$ 1.050,00 — cien veces más. Acá se cubre el caso exacto del reporte y su
 * simétrico en inglés.
 */

async function createGroup(
  page: Page,
  name: string,
  currency: string,
): Promise<string> {
  await page.goto("/nuevo");
  await page.getByPlaceholder("Viaje a Bariloche").fill(name);
  await page.getByLabel("Moneda").selectOption(currency);
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.waitForURL(/\/g\/[0-9a-f-]{36}\/nuevo\/personas$/);
  const id = page.url().split("/g/")[1]!.split("/")[0]!;
  for (const person of ["Ana", "Beto"]) {
    await page.getByPlaceholder("Ej.: Ana").fill(person);
    await page.getByRole("button", { name: "Agregar", exact: true }).click();
    await expect(
      page.getByRole("listitem").filter({ hasText: person }),
    ).toBeVisible();
  }
  await page.getByRole("button", { name: /Continuar con 2/ }).click();
  await page.waitForURL(/\/listo$/);
  await page.getByRole("button", { name: "Ir al resumen" }).click();
  await page.waitForURL(new RegExp(`/g/${id}$`));
  return id;
}

test("interfaz en español + grupo en USD: 10,50 son diez dólares con cincuenta", async ({
  page,
}) => {
  const id = await createGroup(page, "Dólares", "USD");

  await page.goto(`/g/${id}/gastos/nuevo`);
  await page.getByPlaceholder("Cena, supermercado, Uber…").fill("Café");
  await page.locator('input[inputmode="decimal"]').first().fill("10,50");

  // Paso 1: la previsualización del campo ya tiene que decir 10,50 — no 1.050,00.
  const preview = page.locator("text=/^= /");
  await expect(preview).toContainText("10,50");
  await expect(preview).not.toContainText("1.050");

  // Paso 2: el resumen del gasto y el reparto, con el mismo importe.
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByText("Café")).toBeVisible();
  await expect(page.getByText(/10,50/).first()).toBeVisible();
  await expect(page.getByText(/1\.050,00/)).toHaveCount(0);

  // Guardado: en el detalle sigue siendo 10,50 (y cada uno pone 5,25).
  await page.getByRole("button", { name: "Guardar gasto" }).click();
  await page.waitForURL(new RegExp(`/g/${id}$`));
  await page.goto(`/g/${id}/gastos`);
  await expect(page.getByText(/10,50/).first()).toBeVisible();
  await expect(page.getByText(/1\.050,00/)).toHaveCount(0);
});

test("interfaz en español + grupo en ARS: 1.234,56 es mil doscientos treinta y cuatro", async ({
  page,
}) => {
  const id = await createGroup(page, "Pesos", "ARS");

  await page.goto(`/g/${id}/gastos/nuevo`);
  await page.getByPlaceholder("Cena, supermercado, Uber…").fill("Súper");
  await page.locator('input[inputmode="decimal"]').first().fill("1.234,56");
  await expect(page.locator("text=/^= /")).toContainText("1.234,56");

  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Guardar gasto" }).click();
  await page.waitForURL(new RegExp(`/g/${id}$`));
  await page.goto(`/g/${id}/gastos`);
  await expect(page.getByText(/1\.234,56/).first()).toBeVisible();
});

test("con la interfaz en inglés, 10.50 son diez con cincuenta (mismo grupo en ARS)", async ({
  page,
}) => {
  const id = await createGroup(page, "Idioma monto", "ARS");

  // Cambiar la interfaz a inglés desde Configuración.
  await page.goto(`/g/${id}/config`);
  await page.getByRole("tab", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  await page.goto(`/g/${id}/gastos/nuevo`);
  await page.getByPlaceholder("Dinner, groceries, Uber…").fill("Coffee");
  await page.locator('input[inputmode="decimal"]').first().fill("10.50");
  await expect(page.locator("text=/^= /")).toContainText("10.50");

  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Save expense" }).click();
  await page.waitForURL(new RegExp(`/g/${id}$`));
  await page.goto(`/g/${id}/gastos`);
  await expect(page.getByText(/10\.50/).first()).toBeVisible();
  await expect(page.getByText(/1,050\.00/)).toHaveCount(0);
});

test("un pago parcial usa el mismo formato que el gasto", async ({ page }) => {
  const id = await createGroup(page, "Pago parcial", "USD");

  // Gasto de 10,50 pagado por Ana entre los dos -> Beto le debe 5,25.
  await page.goto(`/g/${id}/gastos/nuevo`);
  await page.getByPlaceholder("Cena, supermercado, Uber…").fill("Cena");
  await page.locator('input[inputmode="decimal"]').first().fill("10,50");
  await page.locator("select").first().selectOption({ label: "Ana" });
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Guardar gasto" }).click();
  await page.waitForURL(new RegExp(`/g/${id}$`));

  // Pago parcial de 2,25.
  await page.goto(`/g/${id}/pagos/nuevo`);
  const selects = page.locator("select");
  await selects.nth(0).selectOption({ label: "Beto" });
  await selects.nth(1).selectOption({ label: "Ana" });
  const amount = page.locator('input[inputmode="decimal"]').first();
  await amount.fill("2,25");
  await expect(page.locator("text=/^= /")).toContainText("2,25");
});

test("porcentajes que no suman 100 no dejan guardar y lo explican", async ({
  page,
}) => {
  const id = await createGroup(page, "Porcentajes", "ARS");

  await page.goto(`/g/${id}/gastos/nuevo`);
  await page.getByPlaceholder("Cena, supermercado, Uber…").fill("Reparto");
  await page.locator('input[inputmode="decimal"]').first().fill("1.000,50");
  await page.getByRole("button", { name: "Continuar" }).click();

  await page.getByRole("tab", { name: "A medida" }).click();
  await page.getByRole("tab", { name: "Por porcentaje" }).click();

  // 60 % + 50 % = 110 %.
  await page.getByLabel("Porcentaje de Ana").fill("60");
  await page.getByLabel("Porcentaje de Beto").fill("50");

  const save = page.getByRole("button", { name: "Guardar gasto" });
  await expect(save).toBeDisabled();
  const pctAlert = page.getByRole("alert").first();
  await expect(pctAlert).toContainText("100");
  await expect(pctAlert).toContainText("110");

  // Corregido a 60 + 40 se puede guardar.
  await page.getByLabel("Porcentaje de Beto").fill("40");
  await expect(save).toBeEnabled();
});

test("por monto: si no cuadra, el botón queda deshabilitado y el error va en pesos", async ({
  page,
}) => {
  const id = await createGroup(page, "Montos", "ARS");

  await page.goto(`/g/${id}/gastos/nuevo`);
  await page.getByPlaceholder("Cena, supermercado, Uber…").fill("A medida");
  await page.locator('input[inputmode="decimal"]').first().fill("100");
  await page.getByRole("button", { name: "Continuar" }).click();

  await page.getByRole("tab", { name: "A medida" }).click();
  await page.getByLabel("Monto de Ana").fill("60");
  await page.getByLabel("Monto de Beto").fill("60");

  await expect(page.getByRole("button", { name: "Guardar gasto" })).toBeDisabled();
  const alert = page.getByRole("alert").first();
  // El error habla en dinero, no en unidades mínimas internas (12000 / 10000).
  await expect(alert).toContainText("120,00");
  await expect(alert).toContainText("100,00");
  await expect(alert).not.toContainText("12000");
});
