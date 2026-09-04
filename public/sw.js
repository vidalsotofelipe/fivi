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
 *  - El resto: **allowlist**. Sólo se cachea lo que está explícitamente listado
 *    como público (assets, manifest, iconos y `/api/rates`). Todo lo demás pasa
 *    a la red sin tocar Cache Storage.
 *
 * Qué NUNCA entra a Cache Storage:
 *  - `/api/admin/**` y `/administracion/**` (datos y pantallas administrativas);
 *  - cualquier pedido con encabezado `Authorization`;
 *  - respuestas que no sean `ok` (un 401 cacheado se seguiría sirviendo después
 *    de iniciar sesión);
 *  - respuestas marcadas `Cache-Control: no-store` o `private`.
 *
 * Antes, todo GET same-origin que no fuera documento ni asset caía en
 * stale-while-revalidate: las respuestas del panel admin podían quedar guardadas
 * y servirse más tarde sin autorización.
 *
 * Los datos de la app NO se cachean acá: viven en IndexedDB y los maneja la app.
 */

const VERSION = "v10";
const APP_SHELL = `fivi-shell-${VERSION}`;
const RUNTIME = `fivi-runtime-${VERSION}`;
const SHELL_URLS = ["/", "/nuevo", "/manifest.webmanifest"];

/** Endpoints de API públicos y sin credenciales que sí conviene cachear. */
const CACHEABLE_API = ["/api/rates"];

/**
 * Rutas con id/token en el path: se piden con un placeholder y se guardan bajo
 * la clave normalizada (`/g/_`, `/join/_`), la misma que usa el `fetch` handler.
 * Así, tras `install`, CUALQUIER grupo abre offline aunque nunca se haya visitado.
 */
const NORMALIZED_SHELLS = [
  ["/g/00000000-0000-4000-8000-000000000000", "/g/_"],
  ["/join/00000000-0000-4000-8000-000000000000", "/join/_"],
];

/** Superficie administrativa: nunca se intercepta ni se cachea. */
function isAdminPath(pathname) {
  return (
    pathname === "/administracion" ||
    pathname.startsWith("/administracion/") ||
    pathname === "/api/admin" ||
    pathname.startsWith("/api/admin/")
  );
}

/** Recursos públicos e inmutables/estables que sí se pueden guardar. */
function isPublicAsset(pathname) {
  if (pathname.startsWith("/api/")) return false;
  return (
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/icons/") ||
    pathname.startsWith("/brand/") ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/precache.json" ||
    pathname === "/favicon.ico" ||
    /\.(?:css|js|mjs|woff2?|ttf|otf|png|jpe?g|gif|svg|webp|avif|ico)$/.test(
      pathname,
    )
  );
}

async function precache() {
  const cache = await caches.open(APP_SHELL);
  await cache.addAll(SHELL_URLS).catch(() => {});

  // Shells normalizados de las rutas con id.
  await Promise.all(
    NORMALIZED_SHELLS.map(async ([real, key]) => {
      try {
        const res = await fetch(real, { credentials: "same-origin" });
        if (res.ok || res.type === "opaqueredirect") {
          await cache.put(new Request(self.location.origin + key), res);
        }
      } catch (_) {}
    }),
  );

  // Todos los assets estáticos del build (chunks JS, CSS, fuentes): así la app
  // web entera funciona sin conexión, no sólo las rutas ya visitadas.
  try {
    const list = await fetch("/precache.json", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []);
    const runtime = await caches.open(RUNTIME);
    await Promise.all(
      list
        .filter((url) => {
          try {
            return isPublicAsset(new URL(url, self.location.origin).pathname);
          } catch (_) {
            return false;
          }
        })
        .map((url) =>
          runtime
            .add(new Request(url, { credentials: "same-origin" }))
            .catch(() => {}),
        ),
    );
  } catch (_) {}
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
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

/**
 * Última barrera antes de escribir en Cache Storage. Vale para todas las
 * estrategias: sin esto, un 401 o una respuesta privada podían quedar guardados.
 */
function mayCache(request, response) {
  if (!response || !response.ok) return false;
  if (response.type === "opaque") return false;
  if (request.headers.get("authorization")) return false;
  const cc = (response.headers.get("cache-control") || "").toLowerCase();
  if (cc.includes("no-store") || cc.includes("private")) return false;
  return true;
}

function cachePut(key, request, response) {
  if (!mayCache(request, response)) return;
  const copy = response.clone();
  caches.open(RUNTIME).then((c) => c.put(key, copy));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Superficie administrativa: ni se intercepta. Va directo a la red y nunca
  // toca Cache Storage, ni la petición ni la respuesta.
  if (isAdminPath(url.pathname)) return;

  // Cualquier pedido autenticado queda fuera del cache, sea la ruta que sea.
  if (request.headers.get("authorization")) return;

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
          cachePut(key, request, res);
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
          cachePut(key, request, res);
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
            cachePut(request, request, res);
            return res;
          }),
      ),
    );
    return;
  }

  // Allowlist: assets públicos y los pocos endpoints públicos sin credenciales.
  const cacheable =
    isPublicAsset(url.pathname) || CACHEABLE_API.includes(url.pathname);
  if (!cacheable) return; // todo lo demás va a la red, sin pasar por el cache

  // stale-while-revalidate para lo permitido.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          cachePut(request, request, res);
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
