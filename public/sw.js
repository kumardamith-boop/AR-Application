// Service worker: never caches data. It only keeps a friendly offline page.
const OFFLINE = '/offline.html';
const CACHE = 'cc-offline-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, '/logo.png'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return; // everything else goes straight to the network
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE)));
});
