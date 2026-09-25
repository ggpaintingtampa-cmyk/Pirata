/* Morgan el Pirata app shell cache (update 2026-09-25). Never caches /api/: data is always live. */
const VERSION = 'pirata-shell-v1';
self.addEventListener('install', event => { event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(['./', './index.html', './manifest.webmanifest']).catch(() => undefined)).then(() => self.skipWaiting())); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== VERSION).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  // Network first for the shell; the cache only answers when the network is unreachable.
  event.respondWith(fetch(event.request).then(response => { if (response.ok && (url.pathname.includes('/assets/') || url.pathname.endsWith('/') || url.pathname.endsWith('.html') || url.pathname.endsWith('.webmanifest') || url.pathname.endsWith('.svg') || url.pathname.endsWith('.png'))) { const copy = response.clone(); caches.open(VERSION).then(cache => cache.put(event.request, copy)).catch(() => undefined); } return response; }).catch(() => caches.match(event.request).then(cached => cached ?? (event.request.mode === 'navigate' ? caches.match('./index.html') : undefined)).then(cached => cached ?? Response.error())));
});
