// Service worker for the installed app. Deliberately minimal: every request
// goes to the network as usual. Nothing is served from a cache, so balances
// and account pages are never stale and one person's data is never stored on
// the device. The only thing kept is a small offline page, shown when a page
// can't be opened because there is no connection.
const CACHE = 'tf-offline-v2'
const OFFLINE = '/offline.html'
const PRECACHE = [OFFLINE, '/app/icon-192.png?v=2']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('tf-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()))
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match(OFFLINE)))
  } else if (PRECACHE.includes(new URL(req.url).pathname)) {
    e.respondWith(fetch(req).catch(() => caches.match(req)))
  }
})
