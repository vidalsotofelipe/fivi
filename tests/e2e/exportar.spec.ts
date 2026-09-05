import { test, expect } from "@playwright/test";

/**
 * Exportar el grupo a CSV desde "Más". Se dispara con `Blob` + `<a
 * download>`, sin backend — Playwright lo intercepta como una descarga.
 */

test("descarga un CSV con los gastos y pagos del grupo", async ({ page }) => {
  await page.goto("/nuevo");
  await page.getByPlaceholder("Viaje a Bariloche").fill("Export E2E");
  await page.getByLabel("Moneda").selectOption("ARS");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.waitForURL(/\/g\/[0-9a-f-]{36}\/nuevo\/personas$/);
  const id = page.url().split("/g/")[1]!.split("/")[0]!;
  await page.getByPlaceholder("Ej.: Ana").fill("Ana");
  await page.getByRole("button", { name: "Agregar", exact: true }).click();
  await page.getByRole("button", { name: /Continuar con 1/ }).click();
  await page.waitForURL(/\/listo$/);
  await page.getByRole("button", { name: "Ir al resumen" }).click();
  await page.waitForURL(new RegExp(`/g/${id}$`));

  await page.goto(`/g/${id}/gastos/nuevo`);
  await page.getByPlaceholder("Cena, supermercado, Uber…").fill("Cena export");
  await page.locator('input[inputmode="decimal"]').first().fill("100");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Guardar gasto" }).click();
  await page.waitForURL(new RegExp(`/g/${id}$`));

  await page.goto(`/g/${id}/mas`);
  await page.getByRole("link", { name: "Exportar" }).click();
  await page.waitForURL(new RegExp(`/g/${id}/exportar$`));

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Descargar CSV" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("fivi-export-e2e.csv");

  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const content = Buffer.concat(chunks).toString("utf-8");
  expect(content).toContain("Export E2E");
  expect(content).toContain("Cena export");
  expect(content).toContain("Ana");
});
