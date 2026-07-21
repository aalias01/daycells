/* StreakGrid service worker: offline + fast loads.
 * Strategy: stale-while-revalidate for same-origin GETs. Bump VERSION to
 * force-refresh cached assets after a deploy.
 */
const VERSION = 'sg-v35';
const PRECACHE = [
  './',
  'index.html',
  'css/style.css',
  'js/config.js',
  'js/logic.js',
  'js/store.js',
  'js/sample.js',
  'js/gdrive.js',
  'js/sync.js',
  'js/app.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Google APIs etc. go to network
  e.respondWith(
    caches.open(VERSION).then(async cache => {
      const cached = await cache.match(e.request);
      const network = fetch(e.request)
        .then(res => { if (res.ok) cache.put(e.request, res.clone()); return res; })
        .catch(() => cached);
      return cached || network;
    })
  );
});
