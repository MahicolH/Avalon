const CACHE_NAME = 'avalon-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/visitor_request.html',
  '/resident_generator.html',
  '/img/nuevo-logo.png',
  '/img/logo-prologis.png',
  '/img/logo-martel.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(urlsToCache)));
});

self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});