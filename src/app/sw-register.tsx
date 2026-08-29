"use client";

import { useEffect } from "react";

/**
 * Registra el Service Worker (sección 12). Sólo en producción y si el navegador
 * lo soporta. El SW vive en /sw.js y cachea el app shell para uso offline.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("No se pudo registrar el Service Worker:", err);
      });
    };

    // Si la página ya cargó (el efecto suele correr después del evento `load`),
    // registrar ya; si no, esperar a `load` para no competir con la carga inicial.
    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
