const CACHE = 'uric-acid-v7';
const ASSETS = ['./', './index.html', './styles.css?v=7', './overrides.css?v=7', './app.js?v=7', './manifest.webmanifest?v=7', './icon.svg?v=7', './icon-180.png?v=7', './icon-192.png?v=7', './icon-512.png?v=7'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('uric-acid-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.open(CACHE).then(cache => cache.match(event.request).then(hit => hit || fetch(event.request).then(response => {
    const copy = response.clone(); cache.put(event.request, copy); return response;
  }).catch(() => cache.match('./index.html')))));
});
