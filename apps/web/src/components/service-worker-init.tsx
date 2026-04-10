"use client";

/**
 * ServiceWorkerInit — registra /sw.js uma vez por sessão.
 * Renderiza null; use no RootLayout.
 */

import { useEffect } from "react";

export function ServiceWorkerInit() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        if (process.env.NODE_ENV === "development") {
          console.log("[BOB] SW registrado:", reg.scope);
        }
      })
      .catch((err) => {
        if (process.env.NODE_ENV === "development") {
          console.warn("[BOB] SW falhou:", err);
        }
      });
  }, []);

  return null;
}
