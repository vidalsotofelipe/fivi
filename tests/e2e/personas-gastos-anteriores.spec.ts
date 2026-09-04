import { test, expect, type Page } from "@playwright/test";

/**
 * Sumar a alguien a gastos ya registrados, y "quién sos en este grupo".
 *
 * Es la mitad local del flujo de invitación: elegir quién sos (o sumarte), y
 * decidir en qué gastos anteriores entrás. La otra mitad —crear y abrir un
 * enlace de invitación— necesita Supabase, que este arnés E2E excluye a
 * propósito (corre sin backend).
 *
 * Tres cosas que antes fallaban en silencio:
 *  - "Gastos anteriores" no hacía NADA cuando la persona ya estaba en todos.
 *  - Los gastos con división a medida se omitían por completo, así que "todos o
 *    algunos gastos anteriores" era una promesa incompleta.
 *  - Sumarse como "persona nueva" desde `MePicker` (el flujo típico al entrar
 *    por invitación) nunca preguntaba en qué gastos anteriores corresponde
 *    incluir a esa persona: el sheet se cerraba de una sin ofrecer nada.
 */

async function seedGroup(page: Page): Promise<string> {
  await page.goto("/nuevo");
  await page.getByPlaceholder("Viaje a Bariloche").fill("Anteriores");
  await page.getByLabel("Moneda").selectOption("ARS");
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

/** Gasto de división equitativa entre todos. */
async function addEqualExpense(page: Page, id: string, desc: string, amount: string) {
  await page.goto(`/g/${id}/gastos/nuevo`);
  await page.getByPlaceholder("Cena, supermercado, Uber…").fill(desc);
  await page.locator('input[inputmode="decimal"]').first().fill(amount);
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Guardar gasto" }).click();
  await page.waitForURL(new RegExp(`/g/${id}$`));
}

test("sumar a alguien nuevo a un gasto anterior de partes iguales", async ({
  page,
}) => {
  const id = await seedGroup(page);
  await addEqualExpense(page, id, "Cena", "300");

  // Cami llega después.
  await page.goto(`/g/${id}/config`);
  await page.getByPlaceholder("Ej.: Ana").fill("Cami");
  await page.getByRole("button", { name: "Agregar", exact: true }).click();

  // El panel se abre solo, con el gasto anterior listado y pre-seleccionado.
  const pastPanelTitle = page.getByText("¿Sumar a Cami a gastos ya registrados?");
  await expect(pastPanelTitle).toBeVisible();
  await page.getByRole("button", { name: /Sumar a 1 gasto/ }).click();

  // `confirm()` recalcula el reparto ANTES de cerrar el panel: hay que
  // esperar a que se cierre (no sólo a que el click se despache) antes de
  // navegar, o la navegación puede interrumpir la escritura en IndexedDB.
  await expect(pastPanelTitle).toHaveCount(0);

  // Ahora el gasto se reparte entre tres: 100 cada uno.
  await page.goto(`/g/${id}/balance`);
  await expect(page.getByText(/100,00/).first()).toBeVisible();
});

test("'Gastos anteriores' avisa cuando no hay ninguno donde sumar a la persona", async ({
  page,
}) => {
  const id = await seedGroup(page);
  await addEqualExpense(page, id, "Cena", "300");

  // Ana ya está en el único gasto: no hay nada donde sumarla.
  await page.goto(`/g/${id}/config`);
  await page
    .getByRole("listitem")
    .filter({ hasText: "Ana" })
    .getByRole("button", { name: "Gastos anteriores" })
    .click();

  // Antes no pasaba nada al tocarlo.
  await expect(
    page.getByText("No hay gastos anteriores donde sumar a Ana"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cerrar" }).click();
  await expect(
    page.getByText("No hay gastos anteriores donde sumar a Ana"),
  ).toHaveCount(0);
});

test("un gasto con división a medida se lista aparte y se puede ir a editarlo", async ({
  page,
}) => {
  const id = await seedGroup(page);

  // Gasto con montos a medida: Ana 200, Beto 100.
  await page.goto(`/g/${id}/gastos/nuevo`);
  await page.getByPlaceholder("Cena, supermercado, Uber…").fill("A medida");
  await page.locator('input[inputmode="decimal"]').first().fill("300");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("tab", { name: "A medida" }).click();
  await page.getByLabel("Monto de Ana").fill("200");
  await page.getByLabel("Monto de Beto").fill("100");
  await page.getByRole("button", { name: "Guardar gasto" }).click();
  await page.waitForURL(new RegExp(`/g/${id}$`));

  // Llega Cami.
  await page.goto(`/g/${id}/config`);
  await page.getByPlaceholder("Ej.: Ana").fill("Cami");
  await page.getByRole("button", { name: "Agregar", exact: true }).click();

  // El gasto a medida aparece —antes se omitía— en su propia sección, sin
  // checkbox y con acceso a editarlo.
  await expect(page.getByText("Gastos con división a medida")).toBeVisible();
  await expect(page.getByText("A medida", { exact: true })).toBeVisible();
  const editar = page.getByRole("link", { name: "Editar gasto" });
  await expect(editar).toBeVisible();
  await editar.click();
  await page.waitForURL(/\/gastos\/[0-9a-f-]{36}\/editar$/);
});

test("elegir quién sos en el grupo, y sumarse si no se está en la lista", async ({
  page,
}) => {
  const id = await seedGroup(page);

  await page.goto(`/g/${id}`);
  // Sin "yo" definido, el grupo ofrece indicarlo.
  const cta = page.getByRole("button", { name: "¿Quién sos en este grupo?" });
  await expect(cta).toBeVisible();
  await cta.click();

  // La hoja lista a los participantes y además deja sumarse si no se está.
  await expect(page.getByText("¿No estás en la lista?")).toBeVisible();
  await page.getByRole("button", { name: "Ana", exact: true }).click();

  // Elegido: el grupo ya no pregunta y muestra el balance propio.
  await expect(cta).toHaveCount(0);
});

test("sumarse al grupo desde '¿Quién sos?' cuando no se está en la lista", async ({
  page,
}) => {
  const id = await seedGroup(page);

  await page.goto(`/g/${id}`);
  await page.getByRole("button", { name: "¿Quién sos en este grupo?" }).click();
  await expect(page.getByText("¿No estás en la lista?")).toBeVisible();

  await page.getByPlaceholder("Tu nombre").fill("Dani");
  await page.getByRole("button", { name: "Sumarme al grupo" }).click();

  // Sin gastos anteriores, `AddToPastExpenses` cierra el sheet sola (consulta
  // async a IndexedDB de por medio): hay que esperar a que se cierre antes de
  // navegar, no alcanza con que el click se haya despachado.
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Queda como participante del grupo y como "yo".
  await page.goto(`/g/${id}/personas`);
  await expect(page.getByText("Dani")).toBeVisible();
});

test("sumarse por invitación con un gasto anterior pendiente: pregunta antes de cerrar y aplica el reparto", async ({
  page,
}) => {
  const id = await seedGroup(page);
  await addEqualExpense(page, id, "Cena", "300");

  await page.goto(`/g/${id}`);
  await page.getByRole("button", { name: "¿Quién sos en este grupo?" }).click();
  await expect(page.getByText("¿No estás en la lista?")).toBeVisible();
  await page.getByPlaceholder("Tu nombre").fill("Cami");
  await page.getByRole("button", { name: "Sumarme al grupo" }).click();

  // El sheet NO se cierra todavía: antes pregunta en qué gastos anteriores
  // corresponde sumar a Cami (reusa AddToPastExpenses, pre-tildado porque el
  // único gasto incluye a todo el grupo).
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByText("¿Sumar a Cami a gastos ya registrados?"),
  ).toBeVisible();
  await page.getByRole("button", { name: /Sumar a 1 gasto/ }).click();

  // Confirmado: el sheet se cierra y ya no ofrece elegir quién sos (Cami
  // quedó como "yo").
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "¿Quién sos en este grupo?" }),
  ).toHaveCount(0);

  // El gasto ahora se reparte entre tres: 100 cada uno.
  await page.goto(`/g/${id}/balance`);
  await expect(page.getByText(/100,00/).first()).toBeVisible();
});

test("sumarse por invitación y elegir 'Ahora no': cierra igual, sin tocar el reparto", async ({
  page,
}) => {
  const id = await seedGroup(page);
  await addEqualExpense(page, id, "Cena", "300");

  await page.goto(`/g/${id}`);
  await page.getByRole("button", { name: "¿Quién sos en este grupo?" }).click();
  await page.getByPlaceholder("Tu nombre").fill("Dana");
  await page.getByRole("button", { name: "Sumarme al grupo" }).click();

  await expect(
    page.getByText("¿Sumar a Dana a gastos ya registrados?"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ahora no" }).click();

  // Cierra igual, y Dana ya quedó como "yo" (eso pasa apenas se crea, antes
  // de preguntar por los gastos anteriores).
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "¿Quién sos en este grupo?" }),
  ).toHaveCount(0);

  // El gasto sigue repartido sólo entre Ana y Beto (150 cada uno): "Ahora no"
  // no aplicó ningún reparto.
  await page.goto(`/g/${id}/balance`);
  await expect(page.getByText(/150,00/).first()).toBeVisible();
  await expect(page.getByText(/100,00/)).toHaveCount(0);
});
