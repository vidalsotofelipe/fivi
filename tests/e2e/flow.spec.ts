import { test, expect, type Page } from "@playwright/test";

/**
 * E2E del flujo principal, 100% local (sin Supabase). Cada test arranca con
 * IndexedDB vacía (contexto nuevo de Playwright).
 */

async function createGroup(page: Page, name: string): Promise<string> {
  await page.goto("/nuevo");
  await page.getByPlaceholder("Viaje a Bariloche").fill(name);
  await page.getByRole("button", { name: /^ARS/ }).click();
  await page.getByRole("button", { name: "Crear grupo" }).click();
  await page.waitForURL(/\/g\/[0-9a-f-]{36}$/);
  const id = page.url().split("/g/")[1]!;
  return id;
}

async function addParticipant(page: Page, id: string, name: string) {
  await page.goto(`/g/${id}/config`);
  await page.getByPlaceholder("Nombre").fill(name);
  await page.getByRole("button", { name: "Agregar", exact: true }).click();
  await expect(
    page.getByRole("listitem").filter({ hasText: name }),
  ).toBeVisible();
}

test("flujo completo: grupo, participantes, gasto, balance, pago, editar, borrar", async ({
  page,
}) => {
  const id = await createGroup(page, "Viaje E2E");

  for (const name of ["Ana", "Beto", "Cami"]) {
    await addParticipant(page, id, name);
  }

  // --- registrar un gasto: Cena 3000, paga Ana, entre los 3 ---
  await page.goto(`/g/${id}/gastos/nuevo`);
  await page.getByPlaceholder("Cena, supermercado, Uber…").fill("Cena");
  await page.locator('input[inputmode="decimal"]').first().fill("3000");
  await page.locator("select").first().selectOption({ label: "Ana" });
  await page.getByRole("button", { name: "Guardar gasto" }).click();
  await page.waitForURL(new RegExp(`/g/${id}$`));

  // --- balance: Ana puso 3000, le corresponde 1000 ---
  await page.goto(`/g/${id}/balance`);
  await expect(page.getByText(/Pagó.*3\.000.*le correspondía.*1\.000/)).toBeVisible();

  // --- registrar un pago: Beto -> Ana 1000 ---
  await page.goto(`/g/${id}/pagos/nuevo`);
  await page.locator("select").nth(0).selectOption({ label: "Beto" });
  await page.locator("select").nth(1).selectOption({ label: "Ana" });
  await page.locator('input[inputmode="decimal"]').first().fill("1000");
  await page.getByRole("button", { name: "Registrar pago" }).click();
  await page.waitForURL(new RegExp(`/g/${id}$`));
  await expect(page.getByText(/Pago .*Beto/)).toBeVisible();

  // --- editar el gasto ---
  await page.goto(`/g/${id}/gastos`);
  await page.getByRole("link", { name: /Cena/ }).click();
  await page.getByRole("button", { name: "Editar gasto" }).click();
  await page.getByPlaceholder("Cena, supermercado, Uber…").fill("Cena editada");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(
    page.getByRole("heading", { name: "Cena editada" }),
  ).toBeVisible();

  // --- borrar el gasto ---
  await page.getByRole("button", { name: "Eliminar gasto" }).click();
  await expect(page.getByText("¿Eliminar este gasto?")).toBeVisible();
  await page.getByRole("button", { name: "Eliminar", exact: true }).click();
  await page.waitForURL(new RegExp(`/g/${id}/gastos$`));
  await expect(page.getByText("Sin gastos todavía")).toBeVisible();
});

test("funciona sin conexión: escribir en local sin red", async ({
  page,
  context,
}) => {
  // Setup online: llegar a la pantalla de configuración de un grupo.
  const id = await createGroup(page, "Grupo offline");
  await page.goto(`/g/${id}/config`);
  await expect(page.getByPlaceholder("Nombre")).toBeVisible();

  // A partir de acá, sin conexión. Agregar un participante es una escritura
  // local (IndexedDB) + re-render por useLiveQuery, sin navegación ni red.
  await context.setOffline(true);

  await page.getByPlaceholder("Nombre").fill("Participante offline");
  await page.getByRole("button", { name: "Agregar", exact: true }).click();
  await expect(
    page.getByRole("listitem").filter({ hasText: "Participante offline" }),
  ).toBeVisible();

  // Renombrar el grupo también es local.
  await page
    .getByRole("textbox", { name: "Nombre del grupo" })
    .fill("Renombrado offline");
  await page.getByRole("button", { name: "Guardar datos" }).click();
  await expect(page.getByText("Datos guardados")).toBeVisible();

  await context.setOffline(false);
});
