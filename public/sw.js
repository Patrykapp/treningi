/* Service worker — cache aplikacji do szybkiego startu i pracy przy słabym zasięgu.
   Dane (API) zawsze z sieci; szkic treningu w localStorage chroni wpisy offline. */
const CACHE = 'treningi-v1';
const SHELL = ['/'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // API — tylko sieć (świeże dane); bez sieci aplikacja pokaże własne błędy
  if (url.pathname.startsWith('/api/')) return;

  // Statyczne assety Next.js — cache-first (mają hash w nazwie)
  if (url.pathname.startsWith('/_next/static/') || url.pathname.match(/\.(png|ico|svg|woff2?)$/)) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }))
    );
    return;
  }

  // Nawigacje — sieć z fallbackiem do cache (offline pokaże ostatnią wersję)
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('/')))
    );
  }
});
