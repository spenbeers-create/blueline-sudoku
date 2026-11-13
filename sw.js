/* Offline support: keeps the app on the phone so it opens without internet.
   Bump VERSION on every release so phones pick up the new files. */
const VERSION = 'blueline-1.0.1';
const SHELL = [
  './',
  './index.html',
  './css/app.css',
  './js/engine.js',
  './js/worker.js',
  './js/net.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];
const RUNTIME_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'unpkg.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('blueline-') && k !== VERSION && k !== 'blueline-runtime').map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => { if (e.data === 'skip-waiting') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    // App files: answer from the installed copy, fall back to the network.
    e.respondWith(
      caches.match(req, { ignoreSearch: true }).then(hit => {
        if (hit) return hit;
        if (req.mode === 'navigate') return caches.match('./index.html').then(page => page || fetch(req));
        return fetch(req);
      })
    );
    return;
  }

  if (RUNTIME_HOSTS.includes(url.hostname)) {
    // Fonts and the race library: use the saved copy, refresh it in the background.
    e.respondWith(
      caches.open('blueline-runtime').then(async cache => {
        const hit = await cache.match(req);
        const net = fetch(req).then(res => {
          if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
          return res;
        }).catch(() => hit);
        return hit || net;
      })
    );
  }
});
