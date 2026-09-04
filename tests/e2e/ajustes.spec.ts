import { test, expect } from "@playwright/test";

/**
 * Menú general de la app (idioma, apariencia, apoyar el proyecto), siempre
 * accesible desde el ícono ⚙ del nav superior — en cualquier pantalla, con o
 * sin grupos creados, dentro o fuera de un grupo.
 *
 * Antes Idioma y Apariencia —preferencias del dispositivo, no de un grupo—
 * sólo se podían cambiar entrando a un grupo y abriendo su Configuración.
 *
 * El nombre accesible del ícono es "Ajustes generales" (no "Ajustes" a secas):
 * la Configuración de un grupo también se etiqueta "Ajustes"/"Settings" en
 * algunas pantallas, y un nombre corto colisionaría con ese link.
 */

test("el ícono de ajustes lleva a /ajustes, incluso sin grupos creados", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Ajustes generales" }).click();
  await page.waitForURL(/\/ajustes$/);
  await expect(
    page.getByRole("heading", { name: "Ajustes generales" }),
  ).toBeVisible();
});

test("el ícono está SIEMPRE presente: inicio, dentro de un grupo y en el detalle de un gasto", async ({
  page,
}) => {
  // Inicio, sin grupos: onboarding.
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Ajustes generales" }),
  ).toBeVisible();

  // Crear un grupo con un gasto.
  await page.goto("/nuevo");
  await page.getByPlaceholder("Viaje a Bariloche").fill("Nav global");
  await page.getByLabel("Moneda").selectOption("ARS");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.waitForURL(/\/g\/[0-9a-f-]{36}\/nuevo\/personas$/);
  const id = page.url().split("/g/")[1]!.split("/")[0]!;
  await page.getByPlaceholder("Ej.: Ana").fill("Ana");
  await page.getByRole("button", { name: "Agregar", exact: true }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Ana" })).toBeVisible();
  await page.getByRole("button", { name: /Continuar con 1/ }).click();
  await page.waitForURL(/\/listo$/);
  // "Grupo listo" también lo tiene.
  await expect(
    page.getByRole("link", { name: "Ajustes generales" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Ir al resumen" }).click();
  await page.waitForURL(new RegExp(`/g/${id}$`));
  // Dentro del grupo, junto a la navegación inferior propia del grupo.
  await expect(
    page.getByRole("link", { name: "Ajustes generales" }),
  ).toBeVisible();

  // Un gasto.
  await page.goto(`/g/${id}/gastos/nuevo`);
  await page.getByPlaceholder("Cena, supermercado, Uber…").fill("Café");
  await page.locator('input[inputmode="decimal"]').first().fill("100");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Guardar gasto" }).click();
  await page.waitForURL(new RegExp(`/g/${id}$`));
  await page.getByRole("link", { name: "Café" }).click();

  // El detalle del gasto ya tiene su propio menú (⋯ editar/duplicar/borrar):
  // el ícono de ajustes convive con ese menú contextual, no lo reemplaza.
  await expect(page.getByRole("button", { name: "Editar" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Ajustes generales" }),
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
  await expect(
    page.getByRole("link", { name: "General settings" }),
  ).toBeVisible();
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

test("Cafecito también está en Ajustes generales, no sólo dentro de un grupo", async ({
  page,
}) => {
  await page.goto("/ajustes");
  await expect(page.getByText("Apoyar el proyecto")).toBeVisible();
  const link = page.getByRole("link", {
    name: "Invitame un cafecito en cafecito.app",
  });
  await expect(link).toHaveAttribute(
    "href",
    "https://cafecito.app/vidalsotofelipe",
  );
  await expect(link).toHaveAttribute("target", "_blank");
});

test("sin desborde horizontal en /ajustes a 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/ajustes");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});

test("volver desde /ajustes regresa a donde estabas, no siempre al inicio", async ({
  page,
}) => {
  await page.goto("/nuevo");
  await page.getByPlaceholder("Viaje a Bariloche").fill("Volver bien");
  await page.getByLabel("Moneda").selectOption("ARS");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.waitForURL(/\/g\/[0-9a-f-]{36}\/nuevo\/personas$/);
  const id = page.url().split("/g/")[1]!.split("/")[0]!;
  await page.getByPlaceholder("Ej.: Ana").fill("Ana");
  await page.getByRole("button", { name: "Agregar", exact: true }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Ana" })).toBeVisible();
  await page.getByRole("button", { name: /Continuar con 1/ }).click();
  await page.waitForURL(/\/listo$/);
  await page.getByRole("button", { name: "Ir al resumen" }).click();
  await page.waitForURL(new RegExp(`/g/${id}$`));

  // Desde DENTRO del grupo, ir a Ajustes generales y volver: antes esto
  // mandaba siempre a la lista de grupos ("/"), porque /ajustes usaba un
  // destino fijo en vez del historial de navegación.
  await page.getByRole("link", { name: "Ajustes generales" }).click();
  await page.waitForURL(/\/ajustes$/);
  await page.getByRole("button", { name: "Volver" }).click();
  await expect(page).toHaveURL(new RegExp(`/g/${id}$`));

  // La marca "fivi" sí lleva siempre al inicio, sin importar de dónde vengas.
  await page.getByRole("link", { name: "Ajustes generales" }).click();
  await page.waitForURL(/\/ajustes$/);
  await page.getByRole("link", { name: "fivi", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
});
