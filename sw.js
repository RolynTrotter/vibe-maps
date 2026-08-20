/*
 * Offline cache.
 *
 * The shell and the attribute table are cached on install. The .pmtiles file
 * is not: it is fetched with HTTP range requests, and a Cache API entry for a
 * partial response would be worse than useless. Tiles the user has actually
 * looked at are left to the browser's own HTTP cache, so a revisited area
 * still draws offline while an unvisited one does not.
 */
const VERSION = 'vibe-maps-v1';
const SHELL = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/map.js',
  './js/dataset.js',
  './js/classify.js',
  './vendor/maplibre-gl.js',
  './vendor/maplibre-gl.css',
  './vendor/pmtiles.js',
  './data/india-census-2011.json',
  './data/datasets/india-census-2011.json',
  './manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  // Range requests (the pmtiles archive) must reach the network untouched.
  if (request.headers.has('range')) return;
  if (new URL(request.url).origin !== location.origin) return;

  e.respondWith(
    caches.match(request).then((hit) =>
      hit || fetch(request).then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(request, copy));
        }
        return res;
      })
    )
  );
});
