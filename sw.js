/* Service worker mínimo: hace la web instalable como app.
   No guarda nada en caché a propósito, para que cada actualización se vea al instante. */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function () { /* sin intervenir: todo va a la red */ });
