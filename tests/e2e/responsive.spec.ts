import { test, expect, type Page } from "@playwright/test";

/**
 * Auditoría responsive mobile. Para cada ruta y ancho:
 *  1. sin scroll horizontal a nivel documento,
 *  2. **ningún elemento** desborda el viewport (más fuerte que (1): el
 *     `body { overflow-x: hidden }` de globals.css puede enmascarar un hijo que
 *     se sale — este chequeo lo detecta igual),
 *  3. el contenido principal ocupa el ancho disponible (no "colapsa" a una
 *     columna angosta): `<main>` ~= ancho del viewport y su primer bloque
 *     ~= viewport − márgenes.
 */

const WIDTHS = [320, 360, 375, 390, 430];

async function auditViewport(page: Page, label: string) {
  await page.locator("main").first().waitFor({ state: "visible" });
  // deja asentar el primer render de contenido (useLiveQuery)
  await page.waitForTimeout(150);
  const r = await page.evaluate(() => {
    const doc = document.documentElement;
    const clientW = doc.clientWidth;
    const main = document.querySelector("main");
    const mainW = main ? Math.round(main.getBoundingClientRect().width) : 0;
    // primer bloque de contenido con altura real dentro de main
    const block = main
      ? [...main.children].find(
          (el) => (el as HTMLElement).offsetHeight > 0,
        )
      : null;
    const blockW = block
      ? Math.round(block.getBoundingClientRect().width)
      : 0;
    // ¿algún ancestro gestiona su propio overflow horizontal? entonces que un
    // hijo se salga es aceptable (fila de chips scrolleable, etc.).
    const inScrollArea = (el: Element) => {
      let n: Element | null = el.parentElement;
      while (n && n !== document.body) {
        if (getComputedStyle(n).overflowX !== "visible") return true;
        n = n.parentElement;
      }
      return false;
    };
    // elementos que se salen del viewport por derecha
    const overflow = [...document.querySelectorAll("body *")]
      .filter((el) => {
        const b = el.getBoundingClientRect();
        return b.width > 0 && b.right > clientW + 1 && !inScrollArea(el);
      })
      .slice(0, 6)
      .map((el) => ({
        tag: el.tagName,
        cls: (el.getAttribute("class") || "").slice(0, 70),
        right: Math.round(el.getBoundingClientRect().right),
      }));
    return {
      scrollW: doc.scrollWidth,
      clientW,
      mainW,
      blockW,
      overflow,
    };
  });

  expect(r.scrollW, `${label}: scroll horizontal (${r.scrollW}>${r.clientW})`)
    .toBeLessThanOrEqual(r.clientW);
  expect(r.overflow, `${label}: elementos que desbordan`).toEqual([]);
  expect(r.mainW, `${label}: <main> no ocupa el ancho`).toBeGreaterThanOrEqual(
    r.clientW - 1,
  );
  // el bloque principal ocupa al menos viewport − 40px (márgenes 16+16 + margen)
  expect(
    r.blockW,
    `${label}: contenido colapsado a columna angosta (${r.blockW}px de ${r.clientW}px)`,
  ).toBeGreaterThanOrEqual(r.clientW - 40);
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

  for (const name of ["Ana", "Beto", "Carolina"]) {
    await page.getByPlaceholder("Ej.: Ana").fill(name);
    await page.getByRole("button", { name: "Agregar", exact: true }).click();
    await expect(
      page.getByRole("listitem").filter({ hasText: name }),
    ).toBeVisible();
  }
  await page.getByRole("button", { name: /Continuar con 3/ }).click();
  await page.waitForURL(/\/listo$/);
  await page.getByRole("button", { name: "Ir al resumen" }).click();
  await page.waitForURL(new RegExp(`/g/${id}$`));

  // gasto + pago para que lista / balance / actividad tengan contenido
  await page.goto(`/g/${id}/gastos/nuevo`);
  await page.getByPlaceholder("Cena, supermercado, Uber…").fill("Cena");
  await page.locator('input[inputmode="decimal"]').first().fill("45000.50");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Revisar gasto" }).click();
  await page.getByRole("button", { name: "Guardar gasto" }).click();
  await page.waitForURL(new RegExp(`/g/${id}$`));

  await page.goto(`/g/${id}/pagos/nuevo`);
  await page.locator("select").nth(0).selectOption({ label: "Beto" });
  await page.locator("select").nth(1).selectOption({ label: "Ana" });
  await page.locator('input[inputmode="decimal"]').first().fill("15000");
  await page.getByRole("button", { name: "Confirmar pago" }).click();
  await page.waitForURL(new RegExp(`/g/${id}$`));

  return id;
}

async function routesFor(page: Page, id: string): Promise<string[]> {
  await page.goto(`/g/${id}/personas`);
  const href = await page
    .locator('a[href*="/personas/"]')
    .first()
    .getAttribute("href");
  await page.goto(`/g/${id}/gastos`);
  const exp = await page
    .locator('a[href*="/gastos/"]')
    .first()
    .getAttribute("href");
  return [
    "/",
    "/nuevo",
    `/g/${id}`,
    `/g/${id}/gastos`,
    exp ?? `/g/${id}/gastos`,
    `/g/${id}/gastos/nuevo`,
    `/g/${id}/balance`,
    `/g/${id}/pagos/nuevo`,
    `/g/${id}/personas`,
    href ?? `/g/${id}/personas`,
    `/g/${id}/actividad`,
    `/g/${id}/mas`,
    `/g/${id}/config`,
  ];
}

test("responsive: sin desborde ni columnas angostas (320–430 px)", async ({
  page,
}) => {
  test.setTimeout(180_000); // 5 anchos × ~13 rutas
  const id = await seedGroup(page);
  const routes = await routesFor(page, id);

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 812 });
    for (const route of routes) {
      await page.goto(route);
      await auditViewport(page, `${route} @ ${width}px`);
    }
  }
});

test("responsive: también en inglés (390 px)", async ({ page }) => {
  const id = await seedGroup(page);
  // cambiar idioma en Configuración
  await page.setViewportSize({ width: 390, height: 812 });
  await page.goto(`/g/${id}/config`);
  await page.getByRole("tab", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  for (const route of await routesFor(page, id)) {
    await page.goto(route);
    await auditViewport(page, `EN ${route} @ 390px`);
  }
});
