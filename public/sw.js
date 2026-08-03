// ============================================================
// Wamye driver service worker.
//
// Push notifications only — there is deliberately NO `fetch` handler. Caching
// the driver feed would show a driver courses that were taken twenty minutes
// ago, and they would tap accept and lose. Offline support is a negative
// feature for this app; the network is the source of truth.
//
// Hand-written rather than generated: the Next 16 PWA guide's own suggestion
// (Serwist) still requires a webpack config, and this project is Turbopack.
// ============================================================

self.addEventListener("install", () => {
  // Take over immediately: an old worker holding stale push logic is worse
  // than a brief double-registration.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Wamye", body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? "Wamye", {
      body: payload.body ?? "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-72.png",
      vibrate: [100, 50, 100],
      // Same tag + renotify: a second course replaces the first notification
      // rather than stacking, but still buzzes.
      tag: payload.tag ?? "wamye-course",
      renotify: true,
      data: { url: payload.url ?? "/dashboard" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/dashboard";

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Focus an already-open dashboard rather than opening a second one.
      for (const client of windows) {
        if (client.url.includes("/dashboard")) return client.focus();
      }
      return self.clients.openWindow(url);
    })(),
  );
});

// Chrome rotates subscriptions on its own schedule. Without this the driver
// goes silently deaf and nothing anywhere reports it.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const sub = await self.registration.pushManager.subscribe(
        event.oldSubscription?.options ?? { userVisibleOnly: true },
      );
      await fetch("/api/push/resubscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          oldEndpoint: event.oldSubscription?.endpoint ?? null,
          subscription: sub,
        }),
      });
    })(),
  );
});
