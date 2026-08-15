"use client";

import { useEffect } from "react";

/* ==========================================================================
   Turning the manifest into a PWA

   `app/manifest.ts` was the only service-worker-adjacent file in the project,
   so the app was installable and had no offline behaviour at all: on the
   entry-level Android and unstable connection the product is built around, a
   dropped signal was a browser error page.

   Registered from a component rather than an inline script so the failure is
   ordinary — a browser without service workers, or a page served over plain
   HTTP in development, simply does not register, and nothing about the app
   depends on it having worked.
   ========================================================================== */

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    /* Registered after load rather than during it: the worker's install
       fetches the shell, and competing with the page's own first render for a
       narrow connection is exactly the wrong trade on the devices this is
       for. */
    const register = () => {
      void navigator.serviceWorker
        .register("/service-worker.js")
        .catch((error) => {
          console.info("[pwa] service worker not registered", error);
        });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
