const CACHE_NAME = 'saarthi-shell-v3';
const APP_SHELL = ['/', '/styles.css', '/features.css', '/ist-utils.js', '/app.js', '/manifest.webmanifest', '/icons/saarthi-icon.svg'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  // Live APIs, CCTV signalling and maps must always reach the network.
  if (requestUrl.pathname.startsWith('/api/') || requestUrl.hostname.includes('openstreetmap.org')) return;
  event.respondWith(fetch(event.request).then(response => {
    const copy = response.clone();
    if (requestUrl.origin === self.location.origin && response.ok) {
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
    }
    return response;
  }).catch(() => caches.match(event.request).then(cached => cached || caches.match('/'))));
});
