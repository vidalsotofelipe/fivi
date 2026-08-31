/*
 * Service Worker de fivi (secciones 12 y 15).
 *
 * Estrategia:
 *  - App shell: precache en install de las rutas base.
 *  - Navegaciones: network-first con fallback a cache. Para las rutas de grupo
 *    (`/g/<id>/...`) la clave de cache se normaliza a `/g/_/...`, porque el
 *    árbol de la página es idéntico para todos los grupos (todo es client
 *    component y el id se lee en runtime). Así, tras visitar/prewarmear una
 *    ruta de grupo, TODOS los grupos funcionan sin conexión.
 *  - Estáticos de Next (/_next/static): cache-first (inmutables).
 *  - RSC (?_rsc=…): igual que navegación, con clave normalizada para grupos.
 *  - El resto: stale-while-revalidate.
 *
 * Los datos NO se cachean acá: viven en IndexedDB y los maneja la app.
 */

const VERSION = "v7";
const APP_SHELL = `fivi-shell-${VERSION}`;
const RUNTIME = `fivi-runtime-${VERSION}`;
const SHELL_URLS = ["/", "/nuevo", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(APP_SHELL)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== APP_SHELL && k !== RUNTIME)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/**
 * `/g/<id>/gastos` -> `/g/_/gastos` y `/join/<token>` -> `/join/_`.
 * El árbol de la página es idéntico para cualquier id/token (todo es client
 * component), así un único shell sirve para todos. Además evita cachear el token
 * de invitación como clave.
 */
function normalizeShellPath(pathname) {
  return pathname.replace(/^\/(g|join)\/[^/]+/, "/$1/_");
}

function cachePut(key, response) {
  const copy = response.clone();
  caches.open(RUNTIME).then((c) => c.put(key, copy));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Rutas con id/token en el path que comparten shell: /g/<id>/… y /join/<token>.
  const isShellRoute =
    url.pathname.startsWith("/g/") || url.pathname.startsWith("/join/");
  const isRsc =
    url.searchParams.has("_rsc") || request.headers.get("rsc") === "1";

  // RSC de una ruta con shell: clave normalizada (el árbol no depende del id).
  if (isRsc && isShellRoute) {
    const key = new Request(
      url.origin + normalizeShellPath(url.pathname) + "?_rsc=shell",
    );
    event.respondWith(
      fetch(request)
        .then((res) => {
          cachePut(key, res);
          return res;
        })
        .catch(async () => (await caches.match(key)) || Response.error()),
    );
    return;
  }

  // Navegaciones y pedidos de documento (incluye el prewarm con fetch()).
  const wantsDoc =
    request.mode === "navigate" ||
    request.destination === "document" ||
    (isShellRoute && !isRsc && request.destination === "");

  if (wantsDoc) {
    const key =
      isShellRoute && !isRsc
        ? new Request(url.origin + normalizeShellPath(url.pathname))
        : request;
    event.respondWith(
      fetch(request)
        .then((res) => {
          cachePut(key, res);
          return res;
        })
        .catch(async () => {
          return (
            (await caches.match(key)) ||
            (await caches.match("/")) ||
            Response.error()
          );
        }),
    );
    return;
  }

  // Estáticos inmutables de Next: cache-first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            cachePut(request, res);
            return res;
          }),
      ),
    );
    return;
  }

  // Resto: stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          cachePut(request, res);
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
