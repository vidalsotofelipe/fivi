/*
 * Service Worker de fivi (secciones 12 y 15).
 *
 * Estrategia:
 *  - App shell: precache en install de las rutas base.
 *  - Navegaciones (documentos): network-first con fallback a cache (permite
 *    abrir la app sin conexión).
 *  - Assets estáticos de Next (/_next/static): cache-first (son inmutables).
 *  - El resto: stale-while-revalidate.
 *
 * Los datos NO se cachean acá: viven en IndexedDB y los maneja la app.
 */

const VERSION = "v1";
const APP_SHELL = `fivi-shell-${VERSION}`;
const RUNTIME = `fivi-runtime-${VERSION}`;
const SHELL_URLS = ["/", "/manifest.webmanifest"];

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

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navegaciones: network-first, fallback a cache y luego a "/".
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(RUNTIME).then((c) => c.put(request, copy));
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || caches.match("/");
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
            const copy = res.clone();
            caches.open(RUNTIME).then((c) => c.put(request, copy));
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
          const copy = res.clone();
          caches.open(RUNTIME).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
