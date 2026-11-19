/*
 * Crafty Cottage service worker.
 *
 * Deliberately small and conservative:
 * - Only same-origin GET requests are handled. Firebase (data, sign-in, uploads), Google and
 *   WhatsApp requests go straight to the network, untouched, so prices, stock, orders and
 *   admin data are always live.
 * - Pages are network-first: online visitors always get the latest version; offline they get
 *   the last copy seen, or the offline page.
 * - Build assets (/_next/static) are content-hashed, so they are safe to serve from cache.
 * - Shop pages that change per person (/admin, /checkout) are never stored.
 *
 * Bump VERSION to drop every old cache on the next visit.
 */
const VERSION = 'v2'
const PAGES = `cc-pages-${VERSION}`
const ASSETS = `cc-assets-${VERSION}`
const OFFLINE_URL = '/offline.html'
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png', '/manifest.webmanifest']
const NEVER_CACHE = ['/admin', '/checkout', '/api']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('cc-') && ![PAGES, ASSETS].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  const privatePath = NEVER_CACHE.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`))

  // Pages: network first, fall back to the last copy, then the offline page.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && !privatePath) {
            const copy = response.clone()
            caches.open(PAGES).then((cache) => cache.put(url.pathname, copy))
          }
          return response
        })
        .catch(async () => (!privatePath && (await caches.match(url.pathname))) || caches.match(OFFLINE_URL))
    )
    return
  }

  if (privatePath) return

  // Hashed build files and fonts never change once published: cache first.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone()
              caches.open(ASSETS).then((cache) => cache.put(request, copy))
            }
            return response
          })
      )
    )
    return
  }

  // Product photos and icons: show the cached copy instantly, refresh it in the background.
  if (url.pathname.startsWith('/images/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.open(ASSETS).then(async (cache) => {
        const hit = await cache.match(request)
        const refresh = fetch(request)
          .then((response) => {
            if (response.ok) cache.put(request, response.clone())
            return response
          })
          .catch(() => hit)
        return hit || refresh
      })
    )
  }
})
