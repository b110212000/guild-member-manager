/* Replaced with the built Vite asset manifest in postbuild. */
const CACHE_NAME = 'fev-shell-__FEV_VERSION__';
const PRECACHE = __FEV_PRECACHE__;
const ROOT = new URL(self.registration.scope);
const INDEX = new URL('index.html', ROOT).href;
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE.map(file => new URL(file, ROOT).href))));
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('fev-shell-') && key !== CACHE_NAME) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(ROOT.pathname) || url.pathname.endsWith('/sw.js')) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) (await caches.open(CACHE_NAME)).put(INDEX, response.clone());
        return response;
      } catch {
        return (await caches.match(INDEX)) || Response.error();
      }
    })());
  } else {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok && response.type === 'basic') (await caches.open(CACHE_NAME)).put(request, response.clone());
        return response;
      } catch {
        return Response.error();
      }
    })());
  }
});