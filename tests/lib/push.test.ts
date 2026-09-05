import { afterEach, describe, expect, it, vi } from "vitest";
import { subscribeToPush } from "@/lib/push";

/**
 * `subscribeToPush` no lanza nunca: devuelve POR QUÉ falló. El motivo es lo
 * que decide qué se le muestra al usuario (recargar la página no arregla lo
 * mismo que un firewall), así que el contrato se fija acá.
 */

/** Arma un navegador de mentira con soporte de push. */
function stubBrowser(opts: {
  permission: NotificationPermission;
  requestPermission?: () => Promise<NotificationPermission>;
  serviceWorker?: unknown;
}) {
  const notification = {
    permission: opts.permission,
    requestPermission: opts.requestPermission ?? (async () => opts.permission),
  };
  // `isPushSupported()` mira `"PushManager" in window` y `"Notification" in window`.
  vi.stubGlobal("window", {
    PushManager: class {},
    Notification: notification,
    matchMedia: () => ({ matches: false }),
  });
  vi.stubGlobal("Notification", notification);
  vi.stubGlobal("navigator", {
    userAgent: "test",
    serviceWorker: opts.serviceWorker ?? {},
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("subscribeToPush", () => {
  it("sin las APIs del navegador devuelve 'unsupported', no una excepción", async () => {
    // El entorno de test corre en node: no hay window/Notification/PushManager.
    await expect(subscribeToPush()).resolves.toEqual({
      ok: false,
      reason: "unsupported",
    });
  });

  it("con soporte pero sin clave VAPID devuelve 'no-vapid-key'", async () => {
    stubBrowser({ permission: "granted" });
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "");

    await expect(subscribeToPush()).resolves.toEqual({
      ok: false,
      reason: "no-vapid-key",
    });
  });

  it("si el permiso no queda concedido devuelve 'permission-denied'", async () => {
    stubBrowser({ permission: "default", requestPermission: async () => "denied" });
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "BJ4hioOQ13KbPUWQK1xELXiaKJSLqA");

    await expect(subscribeToPush()).resolves.toEqual({
      ok: false,
      reason: "permission-denied",
    });
  });

  it("si el navegador falla al suscribir devuelve 'browser-error' con el nombre del error", async () => {
    stubBrowser({
      permission: "granted",
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: async () => null,
            subscribe: async () => {
              const err = new Error("Registration failed - push service error");
              err.name = "AbortError";
              throw err;
            },
          },
        }),
      },
    });
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "BJ4hioOQ13KbPUWQK1xELXiaKJSLqA");

    await expect(subscribeToPush()).resolves.toEqual({
      ok: false,
      reason: "browser-error",
      detail: "AbortError",
    });
  });

  it("reusa la suscripción existente sin volver a pedir una nueva", async () => {
    const subscribe = vi.fn();
    stubBrowser({
      permission: "granted",
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: async () => ({
              toJSON: () => ({
                endpoint: "https://push.example/abc",
                keys: { p256dh: "clave-p256dh", auth: "clave-auth" },
              }),
            }),
            subscribe,
          },
        }),
      },
    });
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "BJ4hioOQ13KbPUWQK1xELXiaKJSLqA");

    await expect(subscribeToPush()).resolves.toEqual({
      ok: true,
      subscription: {
        endpoint: "https://push.example/abc",
        keys: { p256dh: "clave-p256dh", auth: "clave-auth" },
      },
    });
    expect(subscribe).not.toHaveBeenCalled();
  });
});
