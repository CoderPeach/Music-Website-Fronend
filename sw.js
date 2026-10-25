/* KOOM service worker: instant loads + offline app shell. Music/API traffic is never cached here. */
const V = 'koom-shell-v27', IMG = 'koom-img-v2';
const SHELL = ['./', 'index.html', 'manifest.webmanifest',
  'js/config.js', 'js/lib/i18n.js?v=5', 'js/lib/app.js?v=5', 'js/core/main.js?v=1', 'js/views/koom.js?v=18',
  'js/features/lyrics.js?v=3', 'js/features/offline.js?v=6', 'js/features/track-info.js?v=1', 'js/features/audio-fx.js?v=1', 'js/features/motion.js?v=3', 'js/ui/transitions.js?v=3',
  'css/00-tokens.css?v=1', 'css/01-base.css?v=1', 'css/02-shell.css?v=1', 'css/03-components.css?v=1', 'css/04-media.css?v=1', 'css/05-pages.css?v=1', 'css/06-player.css?v=1', 'css/07-motion.css?v=1', 'css/08-a11y.css?v=1', 
  'assets/icons/icon-192.png', 'assets/icons/favicon-32.png'];
// install must never fail because one optional file (e.g. an icon) is missing
self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V && k !== IMG).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET') return;
  if (u.origin === location.origin) {                         // app shell: stale-while-revalidate
    e.respondWith(caches.open(V).then(async c => {
      const hit = await c.match(r, { ignoreSearch: false }) || await c.match(r, { ignoreSearch: true });
      const net = fetch(r).then(res => { if (res.ok) c.put(r, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
  } else if (r.destination === 'image') {                     // cover art: cache-first, capped
    e.respondWith(caches.open(IMG).then(async c => {
      const hit = await c.match(r); if (hit) return hit;
      try { const res = await fetch(r); if (res.ok || res.type === 'opaque') { c.put(r, res.clone()); c.keys().then(k => { if (k.length > 300) c.delete(k[0]); }); } return res; } catch (err) { return hit || Response.error(); }
    }));
  }
});
