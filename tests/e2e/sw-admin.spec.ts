import { test, expect } from "@playwright/test";

/**
 * El Service Worker NO debe guardar nada administrativo.
 *
 * Antes, todo GET same-origin que no fuera documento ni asset caía en
 * stale-while-revalidate, así que las respuestas de `/api/admin/**` podían
 * quedar en Cache Storage y servirse después sin autorización (o un 401
 * cacheado podía seguir devolviéndose ya con la sesión iniciada).
 *
 * El resto de los E2E corre con el registro automático del SW apagado para que
 * la navegación sea determinista. Acá se registra a mano: `/sw.js` se sirve
 * igual, y así este escenario queda cubierto de verdad y no por omisión.
 */

const ADMIN_KEY = "e2e-admin-key-0123456789abcdef";

/** Registra el SW y espera a que además CONTROLE a la página. */
async function activateServiceWorker(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    if (reg.installing || reg.waiting) {
      await new Promise<void>((resolve) => {
        const sw = reg.installing ?? reg.waiting!;
        sw.addEventListener("statechange", () => {
          if (sw.state === "activated") resolve();
        });
        if (sw.state === "activated") resolve();
      });
    }
  });
  // Una recarga garantiza que la página quede bajo el control del SW.
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
}

/**
 * Rutas administrativas guardadas en Cache Storage.
 *
 * Se compara el PATHNAME, no la URL entera: los bundles JS del panel viven en
 * `/_next/static/chunks/app/administracion/...` y son assets públicos que sí se
 * precachean. Lo que no puede estar es la ruta administrativa en sí.
 */
function adminPaths(urls: string[]): string[] {
  return urls.filter((u) => {
    const p = new URL(u).pathname;
    return (
      p === "/administracion" ||
      p.startsWith("/administracion/") ||
      p === "/api/admin" ||
      p.startsWith("/api/admin/")
    );
  });
}

/** Todas las URLs guardadas en Cache Storage, de todos los caches. */
async function cachedUrls(page: import("@playwright/test").Page) {
  return page.evaluate(async () => {
    const names = await caches.keys();
    const out: string[] = [];
    for (const name of names) {
      const cache = await caches.open(name);
      for (const req of await cache.keys()) out.push(req.url);
    }
    return out;
  });
}

test("el service worker no cachea nada de /api/admin", async ({ page }) => {
  await activateServiceWorker(page);

  // Control positivo: el SW SÍ intercepta y cachea lo público. Si esto falla,
  // el resto del test no probaría nada.
  await page.evaluate(() => fetch("/manifest.webmanifest").then((r) => r.text()));
  await expect
    .poll(async () => (await cachedUrls(page)).some((u) => u.includes("/manifest.webmanifest")))
    .toBe(true);

  // 1 · Pedido administrativo AUTORIZADO -> 200.
  const authorized = await page.evaluate(async (key) => {
    const res = await fetch("/api/admin/me", {
      headers: { Authorization: `Bearer ${key}` },
    });
    return {
      status: res.status,
      cacheControl: res.headers.get("cache-control"),
      vary: res.headers.get("vary"),
      body: await res.text(),
    };
  }, ADMIN_KEY);
  expect(authorized.status).toBe(200);
  expect(authorized.body).toContain("access-key");
  // 2 · …y viene marcada como no cacheable, para cualquier intermediario.
  expect(authorized.cacheControl).toContain("no-store");
  expect(authorized.cacheControl).toContain("private");
  expect(authorized.vary?.toLowerCase()).toContain("authorization");

  // 3 · Se quita la autorización y se repite: tiene que dar 401, NO la
  // respuesta anterior servida desde el cache.
  const anonymous = await page.evaluate(async () => {
    const res = await fetch("/api/admin/me");
    return { status: res.status, body: await res.text() };
  });
  expect(anonymous.status).toBe(401);
  expect(anonymous.body).not.toContain("access-key");

  // 4 · Cache Storage no tiene NINGUNA URL administrativa.
  expect(adminPaths(await cachedUrls(page))).toEqual([]);
});

test("un 401 tampoco queda cacheado y deja de serlo al autorizar", async ({
  page,
}) => {
  await activateServiceWorker(page);

  // Primero sin credenciales: 401.
  const first = await page.evaluate(() =>
    fetch("/api/admin/me").then((r) => r.status),
  );
  expect(first).toBe(401);

  // Y ahora con credenciales, en la misma página: 200 de verdad, no el 401
  // guardado.
  const second = await page.evaluate(
    (key) =>
      fetch("/api/admin/me", {
        headers: { Authorization: `Bearer ${key}` },
      }).then((r) => r.status),
    ADMIN_KEY,
  );
  expect(second).toBe(200);

  expect(adminPaths(await cachedUrls(page))).toEqual([]);
});

test("las páginas del panel tampoco entran al cache", async ({ page }) => {
  await activateServiceWorker(page);

  await page.goto("/administracion/login");
  await expect(page).toHaveURL(/\/administracion\/login/);

  expect(adminPaths(await cachedUrls(page))).toEqual([]);
});
