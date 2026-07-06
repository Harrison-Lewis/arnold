/* Arnold service worker — offline app shell + CDN asset caching.
   Bump CACHE version whenever index.html changes to force refresh. */
const CACHE = 'arnold-v6';
const SHELL = ['./', 'index.html', 'manifest.json', 'icon.svg', 'whoop-done.html'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // Never cache Supabase API/auth calls — always network
  if (url.hostname.endsWith('supabase.co')) return;

  // Navigations: network-first so deploys show up, cache fallback for offline.
  // Cache under the right key so whoop-done.html never overwrites the app shell.
  if (e.request.mode === 'navigate') {
    const key = url.pathname.endsWith('whoop-done.html') ? 'whoop-done.html' : 'index.html';
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(key, copy));
          return r;
        })
        .catch(() => caches.match(key))
    );
    return;
  }

  // Static + CDN assets (chart.js, supabase-js, fonts): cache-first
  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ||
        fetch(e.request).then((r) => {
          if (r.ok || r.type === 'opaque') {
            const copy = r.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return r;
        })
    )
  );
});
