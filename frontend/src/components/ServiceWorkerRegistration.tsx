"use client";

import { useEffect } from "react";

/**
 * Registers the service worker (public/sw.js) that caches the app shell,
 * static assets and the pass verification key, so the fan app and the vendor
 * terminal keep working when the trackside network drops.
 *
 * Production builds only: in `next dev` a service worker would serve stale
 * bundles and get in the way of hot reloading.
 */
export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("Service worker registration failed:", err);
      });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
