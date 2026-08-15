"use client";

import { useEffect } from "react";

/* ==========================================================================
   Turning the manifest into a PWA

   `app/manifest.ts` was the only service-worker-adjacent file in the project,
   so the app was installable and had no offline behaviour at all: on the
   entry-level Android and unstable connection the product is built around, a
   dropped signal was a browser error page.

   Registered from a component rather than an inline script so the failure is
   ordinary — a browser without service workers simply does not register, and
   nothing about the app depends on it having worked.

   Not in development, and this is not a nicety. The worker serves
   /_next/static/ cache-first, on the sound reasoning that a hashed build asset
   never changes under one URL. In development it does: Turbopack serves chunks
   at stable paths and rewrites them on every edit, so the first version of
   every chunk was cached and served for the life of the browser profile. The
   symptom is a page that keeps throwing an error fixed several rebuilds ago,
   with a server that is serving the correct code — which cost a good while to
   find, because everything on the server side looks right.

   An earlier build of this file registered in development, so a browser that
   opened the app in that window is still holding one. Unregistering here is
   not enough on its own: the caches outlive the worker, so they go too.
   ========================================================================== */

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          void registration.unregister();
        }
      });
      void caches?.keys().then((keys) => {
        for (const key of keys) {
          if (key.startsWith("learners-hub-")) void caches.delete(key);
        }
      });
      return;
    }
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
