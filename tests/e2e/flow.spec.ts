import { test, expect, type Page } from "@playwright/test";

/**
 * E2E del flujo principal, 100% local (sin Supabase). Cada test arranca con
 * IndexedDB vacía (contexto nuevo de Playwright). Español es el idioma por
 * defecto, así que los selectores van por texto en español.
 */

/** Alta de grupo (paso 1/3): nombre + moneda -> queda en /nuevo/personas. */
async function createGroup(page: Page, name: string): Promise<string> {
  await page.goto("/nuevo");
  await page.getByPlaceholder("Viaje a Bariloche").fill(name);
  await page.getByLabel("Moneda").selectOption("ARS");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.waitForURL(/\/g\/[0-9a-f-]{36}\/nuevo\/personas$/);
  return page.url().split("/g/")[1]!.split("/")[0]!;
}

/** Agrega participantes en el alta y confirma -> queda en /listo. */
async function addPeopleDuringSetup(page: Page, names: string[]) {
  for (const name of names) {
    await page.getByPlaceholder("Ej.: Ana").fill(name);
    await page.getByRole("button", { name: "Agregar", exact: true }).click();
    await expect(
      page.getByRole("listitem").filter({ hasText: name }),
    ).toBeVisible();
  }
  await page
    .getByRole("button", { name: new RegExp(`Continuar con ${names.length}`) })
    .click();
  await page.waitForURL(/\/listo$/);
}

async function addExpense(
  page: Page,
  id: string,
  opts: { description: string; amount: string; payer: string },
) {
  await page.goto(`/g/${id}/gastos/nuevo`);
  await page
    .getByPlaceholder("Cena, supermercado, Uber…")
    .fill(opts.description);
  await page.locator('input[inputmode="decimal"]').first().fill(opts.amount);
  await page.locator("select").first().selectOption({ label: opts.payer });
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Guardar gasto" }).click();
  await page.waitForURL(new RegExp(`/g/${id}$`));
}

test("flujo completo: grupo → personas → gasto → balance → pago → editar → borrar", async ({
  page,
}) => {
  const id = await createGroup(page, "Viaje E2E");
  await addPeopleDuringSetup(page, ["Ana", "Beto", "Cami"]);

  // "Ir al resumen" desde la pantalla de grupo listo.
  await page.getByRole("button", { name: "Ir al resumen" }).click();
  await page.waitForURL(new RegExp(`/g/${id}$`));

  // --- gasto: Cena 3000, paga Ana, entre los 3 (partes iguales) ---
  await addExpense(page, id, {
    description: "Cena",
    amount: "3000",
    payer: "Ana",
  });

  // --- balance: Ana recibe, hay una transferencia sugerida ---
  await page.goto(`/g/${id}/balance`);
  await expect(page.getByText("Recibe")).toBeVisible();
  await expect(page.getByText(/le debe .* a /).first()).toBeVisible();

  // --- pago: Beto -> Ana 1000 ---
  await page.goto(`/g/${id}/pagos/nuevo`);
  await page.locator("select").nth(0).selectOption({ label: "Beto" });
  await page.locator("select").nth(1).selectOption({ label: "Ana" });
  await page.locator('input[inputmode="decimal"]').first().fill("1000");
  await page.getByRole("button", { name: "Confirmar pago" }).click();
  await page.waitForURL(new RegExp(`/g/${id}$`));

  // --- actividad: el pago quedó registrado ---
  await page.goto(`/g/${id}/actividad`);
  await expect(page.getByText("Beto le pagó a Ana")).toBeVisible();
  await expect(page.getByText(/agregó el gasto .*Cena/)).toBeVisible();

  // --- editar el gasto ---
  await page.goto(`/g/${id}/gastos`);
  await page.getByRole("link", { name: /Cena/ }).click();
  await page.waitForURL(/\/gastos\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Editar" }).click(); // abre el menú
  await page.getByRole("link", { name: "Editar gasto" }).click();
  await page.waitForURL(/\/editar$/);
  await page
    .getByPlaceholder("Cena, supermercado, Uber…")
    .fill("Cena editada");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await page.waitForURL(/\/gastos\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { name: "Cena editada" }),
  ).toBeVisible();

  // --- historial: "¿Qué cambió?" muestra la descripción anterior ---
  await page.getByText("¿Qué cambió?").click();
  await expect(page.getByText(/Antes decía .*Cena/)).toBeVisible();

  // --- borrar el gasto ---
  await page.getByRole("button", { name: "Editar" }).click();
  await page.getByRole("button", { name: "Eliminar", exact: true }).click();
  await expect(page.getByText(/Eliminar .*Cena editada/)).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Eliminar", exact: true })
    .click();
  await page.waitForURL(new RegExp(`/g/${id}/gastos$`));
  await expect(page.getByText("Todavía no hay gastos")).toBeVisible();
});

test("'grupo listo' muestra las dos acciones; llegar con ?join=1 pide quién sos", async ({
  page,
}) => {
  const id = await createGroup(page, "Onboarding E2E");
  await addPeopleDuringSetup(page, ["Ana", "Bruno"]);

  // Pantalla "Tu grupo está listo": los dos CTA quedan visibles (antes se iban
  // al borde inferior con `mt-auto` y en algunos teléfonos no se veían).
  await expect(
    page.getByRole("link", { name: "Agregar primer gasto" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Ir al resumen" }),
  ).toBeVisible();

  // Simular la llegada por invitación: el resumen abre "¿Quién sos?" y limpia
  // el parámetro. Se puede elegir un participante o sumarse.
  await page.goto(`/g/${id}?join=1`);
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("¿Quién sos en este grupo?")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Sumarme al grupo" })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/g/${id}$`)); // sin ?join=1

  // Tocar el fondo gris cierra la hoja. Regresión real: el handler estaba en
  // el contenedor de afuera comparando `e.target === e.currentTarget`, pero el
  // fondo gris es un div que lo tapa entero, así que el clic nunca llegaba y
  // no pasaba nada. Se toca bien arriba, lejos del panel (que va abajo).
  await page.mouse.click(200, 60);
  await expect(sheet).toBeHidden();

  // La ✕ también. Su nombre accesible es "Cerrar panel" y no "Cerrar" a
  // propósito: esta hoja ya trae un botón "Cerrar" propio adentro, y dos
  // controles con el mismo nombre serían ambiguos.
  await page.goto(`/g/${id}?join=1`);
  await sheet.getByRole("button", { name: "Cerrar panel" }).click();
  await expect(sheet).toBeHidden();

  await page.goto(`/g/${id}?join=1`);
  await sheet.getByRole("button", { name: "Ana", exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText("Tu balance")).toBeVisible();
});

test("escritura local sin conexión (IndexedDB, sin red)", async ({
  page,
  context,
}) => {
  const id = await createGroup(page, "Grupo offline");
  await addPeopleDuringSetup(page, ["Uno"]);
  await page.getByRole("button", { name: "Ir al resumen" }).click();
  await page.waitForURL(new RegExp(`/g/${id}$`));

  await page.goto(`/g/${id}/config`);
  await expect(
    page.getByRole("textbox", { name: "Nombre del grupo" }),
  ).toBeVisible();

  // A partir de acá, sin red. Agregar persona y renombrar son escrituras
  // locales (IndexedDB) + re-render por useLiveQuery, sin navegación.
  await context.setOffline(true);

  await page.getByPlaceholder("Ej.: Ana").fill("Persona offline");
  await page.getByRole("button", { name: "Agregar", exact: true }).click();
  await expect(
    page.getByRole("listitem").filter({ hasText: "Persona offline" }),
  ).toBeVisible();

  await page
    .getByRole("textbox", { name: "Nombre del grupo" })
    .fill("Renombrado offline");
  await page.getByRole("button", { name: "Guardar datos" }).click();
  await expect(page.getByText("Datos guardados")).toBeVisible();

  await context.setOffline(false);
});

test("eliminar grupo avisa cuántas personas y gastos se pierden", async ({
  page,
}) => {
  const id = await createGroup(page, "Grupo a borrar");
  await addPeopleDuringSetup(page, ["Ana", "Beto"]);
  await page.getByRole("button", { name: "Ir al resumen" }).click();
  await page.waitForURL(new RegExp(`/g/${id}$`));
  await addExpense(page, id, { description: "Cena", amount: "300", payer: "Ana" });

  await page.goto(`/g/${id}/config`);
  await page.getByRole("button", { name: "Eliminar grupo" }).click();

  // Ana y Beto (sin "quién soy" seteado en este test) y 1 gasto.
  await expect(page.getByText(/2 personas/)).toBeVisible();
  await expect(page.getByText(/1 gasto\b/)).toBeVisible();

  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByText(/2 personas/)).toHaveCount(0);
});
