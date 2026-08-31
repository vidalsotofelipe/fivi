"use client";

import { useEffect } from "react";

/** Rutas de grupo cuyo "shell" conviene tener cacheado para uso offline. */
const GROUP_SUBROUTES = [
  "",
  "/gastos",
  "/gastos/nuevo",
  "/balance",
  "/pagos/nuevo",
  "/config",
];
const PLACEHOLDER_ID = "00000000-0000-4000-8000-000000000000";

/**
 * Registra el Service Worker (sección 12) y, cuando hay conexión, "prewarmea"
 * el shell de las rutas de grupo: como el SW normaliza `/g/<id>/…` a
 * `/g/_/…`, con una sola visita quedan disponibles sin conexión TODOS los
 * grupos (sección 15). Sólo en producción.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    // Los E2E corren contra `next start` (producción) pero necesitan un entorno
    // determinista sin caché de SW entre navegaciones.
    if (process.env.NEXT_PUBLIC_DISABLE_SW === "1") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const prewarm = () => {
      if (!navigator.onLine) return;
      for (const sub of GROUP_SUBROUTES) {
        fetch(`/g/${PLACEHOLDER_ID}${sub}`, { credentials: "same-origin" }).catch(
          () => {},
        );
      }
      // Shell de /join/<token> (mismo criterio: el SW lo normaliza a /join/_).
      fetch(`/join/${PLACEHOLDER_ID}`, { credentials: "same-origin" }).catch(
        () => {},
      );
    };

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        // Espera a que el SW controle la página antes de prewarmear.
        if (navigator.serviceWorker.controller) prewarm();
        else
          navigator.serviceWorker.addEventListener(
            "controllerchange",
            prewarm,
            { once: true },
          );
        void reg;
      } catch (err) {
        console.warn("No se pudo registrar el Service Worker:", err);
      }
    };

    if (document.readyState === "complete") {
      void register();
      return;
    }
    const onLoad = () => void register();
    window.addEventListener("load", onLoad, { once: true });
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
