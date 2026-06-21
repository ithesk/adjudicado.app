"use client";

import { useEffect } from "react";

// Esta app NO usa service worker. Pero otros proyectos corridos en el mismo
// localhost (p. ej. un PWA) pueden dejar uno registrado que cachea JS viejo y
// rompe la interactividad. Esto desregistra cualquier SW y limpia sus cachés.
export default function ServiceWorkerCleanup() {
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .getRegistrations()
        .then((rs) => rs.forEach((r) => r.unregister()))
        .catch(() => {});
    }
    if (typeof caches !== "undefined") {
      caches
        .keys()
        .then((ks) => ks.forEach((k) => caches.delete(k)))
        .catch(() => {});
    }
  }, []);

  return null;
}
