import { test, expect } from "@playwright/test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Formulario de feedback (`/ajustes/feedback`), alcanzable desde "Ayudanos a
 * mejorar" en Ajustes generales.
 *
 * Este arnés E2E corre a propósito SIN credenciales de Supabase (ver
 * `playwright.config.ts`), así que un envío real siempre da 503 ("No
 * disponible") — lo que se prueba acá es que ese caso se maneja con gracia
 * (sin perder lo escrito, sin crashear), no un envío exitoso de punta a
 * punta. Eso se verificó a mano contra producción (ver CHANGELOG).
 */

/** 1×1 PNG válido (para probar la subida real, no un mock). */
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function tmpFile(name: string, data: Buffer): string {
  const dir = mkdtempSync(join(tmpdir(), "fivi-feedback-"));
  const path = join(dir, name);
  writeFileSync(path, data);
  return path;
}

test("desde Ajustes generales, 'Ayudanos a mejorar' lleva al formulario", async ({
  page,
}) => {
  await page.goto("/ajustes");
  await expect(page.getByText("Ayudanos a mejorar")).toBeVisible();
  await page.getByRole("link", { name: /Enviar comentario/ }).click();
  await expect(page).toHaveURL(/\/ajustes\/feedback$/);
  await expect(page.getByText("¿Sobre qué querés escribir?")).toBeVisible();
});

test("elegir una categoría avanza al detalle; 'Volver' regresa a elegir categoría", async ({
  page,
}) => {
  await page.goto("/ajustes/feedback");
  for (const label of [
    "Encontré un problema",
    "Tengo una sugerencia",
    "Tengo una consulta",
    "Otro comentario",
  ]) {
    await expect(page.getByText(label)).toBeVisible();
  }

  await page.getByText("Tengo una sugerencia").click();
  await expect(page.getByLabel("Título")).toBeVisible();
  // No es un bug: no aparecen los campos extra de reproducción.
  await expect(page.getByText("¿Qué estabas intentando hacer?")).toHaveCount(0);

  // Hay dos controles llamados "Volver": la flecha global del AppBar y el
  // botón del paso (dentro del StickyActionBar, el último en el DOM).
  await page.getByRole("button", { name: "Volver" }).last().click();
  await expect(page.getByText("¿Sobre qué querés escribir?")).toBeVisible();
});

test("'Encontré un problema' muestra los campos extra y relabela la descripción", async ({
  page,
}) => {
  await page.goto("/ajustes/feedback");
  await page.getByText("Encontré un problema").click();
  await expect(page.getByLabel("¿Qué ocurrió?")).toBeVisible();
  await expect(page.getByLabel("¿Qué estabas intentando hacer?")).toBeVisible();
  await expect(page.getByLabel("¿Qué esperabas que ocurriera?")).toBeVisible();
});

test("valida título y descripción antes de enviar", async ({ page }) => {
  await page.goto("/ajustes/feedback");
  await page.getByText("Otro comentario").click();
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByText("Ingresá un título")).toBeVisible();
  await expect(page.getByText("Contanos qué pasó")).toBeVisible();
});

test("un email con formato inválido muestra error; uno válido no", async ({
  page,
}) => {
  await page.goto("/ajustes/feedback");
  await page.getByText("Otro comentario").click();
  await page.getByLabel("Título").fill("Algo");
  await page.getByLabel("Descripción").fill("Pasó esto");

  await page.getByLabel("Email de contacto").fill("no-es-un-email");
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByText("El email no parece válido")).toBeVisible();

  await page.getByLabel("Email de contacto").fill("si@valido.com");
  await expect(page.getByText("El email no parece válido")).toHaveCount(0);
});

test("adjuntar una captura válida muestra la vista previa; 'Quitar' la saca", async ({
  page,
}) => {
  const path = tmpFile("captura.png", PNG_1PX);
  await page.goto("/ajustes/feedback");
  await page.getByText("Otro comentario").click();

  await page.locator('input[type="file"]').setInputFiles(path);
  await expect(
    page.getByAltText("Vista previa de la captura adjunta"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Quitar" }).click();
  await expect(page.getByAltText("Vista previa de la captura adjunta")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Adjuntar captura" })).toBeVisible();
});

test("un archivo que no es imagen se rechaza en el cliente, con mensaje claro", async ({
  page,
}) => {
  const path = tmpFile("no-es-imagen.txt", Buffer.from("hola"));
  await page.goto("/ajustes/feedback");
  await page.getByText("Otro comentario").click();

  await page.locator('input[type="file"]').setInputFiles({
    name: "no-es-imagen.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hola"),
  });
  void path;
  await expect(
    page.getByText("La captura debe ser una imagen JPG, PNG o WEBP"),
  ).toBeVisible();
  // Y no queda ninguna vista previa cargada.
  await expect(page.getByAltText("Vista previa de la captura adjunta")).toHaveCount(0);
});

test("sin backend configurado, el envío falla con gracia (sin perder lo escrito)", async ({
  page,
}) => {
  await page.goto("/ajustes/feedback");
  await page.getByText("Otro comentario").click();
  await page.getByLabel("Título").fill("Título de prueba");
  await page.getByLabel("Descripción").fill("Descripción de prueba");

  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByText("No disponible")).toBeVisible();

  // Sigue en el formulario, con lo escrito intacto (no se perdió nada).
  await expect(page).toHaveURL(/\/ajustes\/feedback$/);
  await expect(page.getByLabel("Título")).toHaveValue("Título de prueba");
});

test("sin desborde horizontal en el formulario, en los dos pasos, a 320px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/ajustes/feedback");
  const overflow = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
  expect(await overflow()).toBe(false);

  await page.getByText("Encontré un problema").click();
  expect(await overflow()).toBe(false);
});
