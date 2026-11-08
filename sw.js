
/* Service worker placeholder. Plan B has no web-push endpoint. */
self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(self.clients.claim()); });
