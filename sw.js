/* Offline support: keeps the app on the phone so it opens without internet.
   Bump VERSION on every release so phones pick up the new files. */
const VERSION = 'blueline-1.4.1';
const KEEP = ['blueline-runtime', 'blueline-data'];
const SHELL = [
  './',
  './index.html',
  './css/app.css',
  './css/games.css',
  './js/engine.js',
  './js/worker.js',
  './js/net.js',
  './js/app.js',
  './js/firebase-config.js',
  './js/online.js',
  './js/views.js',
  './js/hub.js',
  './js/games/four.js',
  './js/games/chess.js',
  './js/games/chess-ai.js',
  './js/games/chess-view.js',
  './js/menus/chess-menu.js',
  './js/chess-worker.js',
  './js/games/eights.js',
  './js/games/words.js',
  './js/games/words-view.js',
  './js/menus/words-menu.js',
  './js/games/fuse.js',
  './js/games/fuse-prompts.js',
  './js/games/fuse-view.js',
  './js/menus/fuse-menu.js',
  './js/tv.js',
  './js/games/fuse-tv.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];
// Fonts, the Sudoku race library and the online-play library.
const RUNTIME_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'unpkg.com', 'www.gstatic.com', 'cdnjs.cloudflare.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('blueline-') && k !== VERSION && !KEEP.includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => { if (e.data === 'skip-waiting') self.skipWaiting(); });

function saveAndServe(cacheName, req) {
  return caches.open(cacheName).then(async cache => {
    const hit = await cache.match(req);
    const net = fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    }).catch(() => hit);
    return hit || net;
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    // Big word lists download the first time they're needed, then stay on the phone.
    if (url.pathname.includes('/data/')) { e.respondWith(saveAndServe('blueline-data', req)); return; }
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
    // Use the saved copy, refresh it in the background.
    e.respondWith(saveAndServe('blueline-runtime', req));
  }
});
