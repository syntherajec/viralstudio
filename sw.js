/* ═══════════════════════════════════════════════════════════
   Viral Studio PRO — Service Worker v7.0
   - Cache aset statis (app shell)
   - Request ke openrouter.ai TIDAK di-cache (selalu network)
   ═══════════════════════════════════════════════════════════ */

const CACHE  = 'viralstudio-v8';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

/* ── Install: cache semua aset statis ───────────────────── */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

/* ── Activate: hapus cache versi lama ───────────────────── */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ── Fetch: strategi per jenis request ──────────────────── */
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  /* 1. API call ke OpenRouter → selalu ke network, JANGAN cache */
  if (url.hostname === 'openrouter.ai') {
    e.respondWith(fetch(e.request));
    return;
  }

  /* 2. Request eksternal lain (CDN, dll) → network only */
  if (url.origin !== self.location.origin) {
    e.respondWith(fetch(e.request).catch(() => new Response('', { status: 503 })));
    return;
  }

  /* 3. Aset lokal → cache-first, fallback ke network lalu cache */
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;

      return fetch(e.request).then(res => {
        /* Hanya cache response yang valid dan tipe basic (same-origin) */
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match('/index.html'));
    })
  );
});
