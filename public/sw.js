const CACHE_NAME = 'rupa-shell-v5';
const OFFLINE_FILES = [
  'offline/artworks.json',
  // Small offline search indexes. Large game/anime shards and the museum pack are cached the first time they are used.
  'offline/index/manifest.json',
  'offline/index/works.json',
  'offline/art/yvette-guilbert-web.jpg',
  'offline/art/yvette-guilbert-print.jpg',
  'offline/art/may-milton-web.jpg',
  'offline/art/may-milton-print.jpg',
  'offline/art/lembree-gallery-web.jpg',
  'offline/art/lembree-gallery-print.jpg',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const scope = new URL('./', self.registration.scope);
    const shell = new URL('./', scope);
    const response = await fetch(shell, { cache: 'reload' });
    if (response.ok) {
      const html = await response.clone().text();
      await cache.put(shell, response);
      const entryFiles = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css)(?:\?[^\"]*)?)"/g)]
        .map(match => new URL(match[1], shell))
        .filter(url => url.origin === self.location.origin && url.pathname.startsWith(scope.pathname));
      await Promise.all(entryFiles.map(url => cache.add(url).catch(() => undefined)));
    }
    await Promise.all(OFFLINE_FILES.map(path => cache.add(new URL(path, scope)).catch(() => undefined)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('rupa-shell-') && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  const scopePath = new URL('./', self.registration.scope).pathname;
  if (!url.pathname.startsWith(scopePath)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    if (request.mode === 'navigate') {
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(new URL('./', self.registration.scope), response.clone());
        return response;
      } catch {
        return await cache.match(new URL('./', self.registration.scope)) || Response.error();
      }
    }
    const cached = await cache.match(request);
    if (url.pathname.endsWith('/collections/ghibli.json')
      || url.pathname.endsWith('/collections/shinkai.json')
      || url.pathname.endsWith('/collections/shinkai-assets.json')
      || url.pathname.endsWith('/collections/shinkai-assets.v2.json')
      || url.pathname.endsWith('/collections/shinkai-exhibitions.json')
      || url.pathname.endsWith('/data/apple-trends.json')
      || url.pathname.endsWith('/data/games-trending.json')) {
      // Refresh curated collections and chart snapshots on every visit, keeping the latest response for offline use.
      try {
        const response = await fetch(new Request(request, { cache: 'no-store' }));
        if (response.ok) {
          await cache.put(request, response.clone());
          return response;
        }
        return cached || response;
      } catch {
        return cached || Response.error();
      }
    }
    if (url.pathname.includes('/offline/index/') || url.pathname.endsWith('/offline/artworks.json')) {
      // Indexes change when the upstream sync runs: answer from cache, refresh in the background.
      const refresh = fetch(request).then(response => { if (response.ok) cache.put(request, response.clone()); return response; }).catch(() => undefined);
      return cached || await refresh || Response.error();
    }
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok && response.type !== 'opaque') await cache.put(request, response.clone());
      return response;
    } catch {
      return Response.error();
    }
  })());
});
