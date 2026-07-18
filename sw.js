// Expoloom AI — Service Worker
// Purpose: deliver "your response is ready" notifications reliably, even when the
// browser tab is backgrounded/minimized. A notification triggered via a Service
// Worker's registration.showNotification() is handled by the OS/browser notification
// system directly and is far more likely to actually appear than a plain
// `new Notification()` call made from a page whose JS may be throttled/suspended.

const SW_VERSION = "1.0";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Listens for a message from the page (sent when an AI response finishes) and
// shows a notification. This works even if the page that sent the message has
// since been backgrounded, because the service worker runs independently.
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SHOW_RESPONSE_NOTIFICATION") {
    const title = data.title || "Expoloom AI";
    const body = data.body || "Your response is ready.";
    event.waitUntil(
      self.registration.showNotification(title, {
        body: body,
        icon: "/favicons/android-chrome-192x192.png",
        badge: "/favicons/favicon-96x96.png",
        tag: data.chatId ? `chat-${data.chatId}` : "expoloom-response",
        renotify: true,
        data: { chatId: data.chatId || null }
      })
    );
  }
});

// Focus (or open) the app when the user taps the notification.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/");
    })
  );
});
