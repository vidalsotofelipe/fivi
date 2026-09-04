import { test, expect } from "@playwright/test";

/**
 * Arranque con el navegador en inglés y SIN preferencia guardada.
 *
 * El bug: `LocaleProvider` llamaba a `changeLanguage` ANTES de registrar el
 * listener `languageChanged`. Con los recursos embebidos el evento se emite en
 * el acto, así que se perdía: i18next quedaba en "en" (textos y `<html lang>` en
 * inglés) pero el estado de React seguía en "es", y de ahí salían el selector
 * marcando "Español", las fechas y tiempos relativos en español dentro de frases
 * inglesas, y los nombres de moneda en español.
 */

test.use({ locale: "en-US" });

test("navegador en inglés: interfaz, <html lang>, selector, fechas y monedas, todo en inglés", async ({
  page,
}) => {
  // Sin preferencia guardada: es la primera visita del contexto.
  await page.goto("/");
  await expect(
    page.evaluate(() => window.localStorage.getItem("fivi:lang")),
  ).resolves.toBeNull();

  // 1 · La interfaz y el atributo lang.
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("link", { name: /Create my first group/i }),
  ).toBeVisible();

  // Alta de grupo, en inglés.
  await page.goto("/nuevo");
  await page.getByPlaceholder("Trip to Bariloche").fill("Language QA");

  // 2 · Los nombres de moneda del selector, en inglés (no "Peso argentino").
  const currency = page.getByLabel("Currency");
  await expect(currency).toBeVisible();
  const options = await page.locator("select option").allTextContents();
  const ars = options.find((o) => o.startsWith("ARS"));
  expect(ars).toBeTruthy();
  expect(ars!.toLowerCase()).toContain("argentine");
  expect(ars!.toLowerCase()).not.toContain("argentino");

  await currency.selectOption("ARS");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/g\/[0-9a-f-]{36}\/nuevo\/personas$/);
  const id = page.url().split("/g/")[1]!.split("/")[0]!;

  await page.getByPlaceholder("e.g. Ana").fill("Ana");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Ana" })).toBeVisible();
  await page.getByRole("button", { name: /Continue with 1/ }).click();
  await page.waitForURL(/\/listo$/);
  await page.getByRole("button", { name: "Go to summary" }).click();
  await page.waitForURL(new RegExp(`/g/${id}$`));

  // 3 · El selector de idioma marca "English", no "Español".
  await page.goto(`/g/${id}/config`);
  await expect(page.getByRole("tab", { name: "English" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("tab", { name: "Español" })).toHaveAttribute(
    "aria-selected",
    "false",
  );

  // 4 · Fechas y tiempos relativos, en inglés.
  await page.goto(`/g/${id}/gastos/nuevo`);
  await page.getByPlaceholder("Dinner, groceries, Uber…").fill("Coffee");
  await page.locator('input[inputmode="decimal"]').first().fill("10.00");
  await page.getByRole("button", { name: "Continue" }).click();
  // El resumen del paso 2 trae la fecha del gasto formateada.
  const monthsEs = /\b(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\b/i;
  await expect(page.locator("body")).not.toContainText(monthsEs);
  await page.getByRole("button", { name: "Save expense" }).click();
  await page.waitForURL(new RegExp(`/g/${id}$`));

  // "Recent activity" usa tiempos relativos: en inglés dice "now"/"ago",
  // nunca "hace" ni "ahora".
  await expect(page.locator("body")).not.toContainText(/\bhace\b/i);

  // 5 · Persiste tras recargar.
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("link", { name: "Summary" })).toBeVisible();
});
