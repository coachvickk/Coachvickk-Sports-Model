const CACHE_NAME = 'blakes-damage-report-v4';
const ASSETS = [
  '/Coachvickk-Sports-Model/',
  '/Coachvickk-Sports-Model/index.html',
  '/Coachvickk-Sports-Model/manifest.json',
  '/Coachvickk-Sports-Model/icon-192.svg',
  '/Coachvickk-Sports-Model/icon-512.svg',
  '/Coachvickk-Sports-Model/icon-maskable.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first strategy: always try fresh content, fall back to cache
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request).then(response => {
      if (response.ok && event.request.method === 'GET') {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
      }
      return response;
    }).catch(() => {
      return caches.match(event.request).then(cached => {
        return cached || caches.match('/Coachvickk-Sports-Model/index.html');
      });
    })
  );
});
