// Sekelas Cafe service worker — vanilla, no Workbox, dev-safe.
// Same-origin GET only; everything else passes through untouched.
//   Navigations     : network-first (15s timeout) — dev HMR / fresh HTML wins.
//   /api/*          : always network, never cached (POS data must be fresh).
//   Brand assets    : cache-first (icons, logo — content never changes).
//   Everything else : network-first with cache fallback (incl. /_next/static/:
//                     instant via HTTP cache in prod, always-fresh in dev).

const VERSION = 'v2'
const CACHE = `sekelas-${VERSION}`
const OFFLINE_URL = '/offline'
// Generous on purpose: first-visit page compilation in dev can take several
// seconds — the offline fallback should only appear for genuinely dead nets.
const NAV_TIMEOUT_MS = 15000

const PRECACHE_URLS = [
  '/offline',
  '/logo.png',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-192.png',
  '/icons/maskable-512.png',
]

// ---------- Lifecycle ----------

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      try {
        await cache.addAll(PRECACHE_URLS)
      } catch {
        // One unavailable asset must never break install — retry one by one.
        await Promise.all(
          PRECACHE_URLS.map((url) => cache.add(url).catch(() => undefined))
        )
      }
      await self.skipWaiting()
    })()
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))
      )
      await self.clients.claim()
    })()
  )
})

// Manual update signal from the page (e.g. an "update available" toast).
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

// ---------- Strategies ----------

/** Fetch with a hard timeout; rejects on network error or abort. */
async function fetchWithTimeout(request, ms) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(request, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** Cache-first: serve stale without revalidating, fill the cache on miss.
 *  Only for brand assets that never change (icons, logo). */
async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) {
    const cache = await caches.open(CACHE)
    await cache.put(request, response.clone())
  }
  return response
}

/**
 * Network-first with cache fallback. `timeoutMs` of 0 means no timeout;
 * `offlineFallback` additionally serves the cached /offline shell (HTML).
 */
async function networkFirst(request, timeoutMs, offlineFallback) {
  try {
    const response =
      timeoutMs > 0 ? await fetchWithTimeout(request, timeoutMs) : await fetch(request)
    if (response.ok) {
      const cache = await caches.open(CACHE)
      await cache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await caches.match(request)
    if (cached) return cached
    if (offlineFallback) {
      const offline = await caches.match(OFFLINE_URL)
      if (offline) return offline
    }
    // Minimal inline fallback so the SW never fails to respond.
    return new Response('Sekelas Cafe — offline.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }
}

/** Immutable, never-changing brand assets — safe for cache-first. */
function isBrandAsset(pathname) {
  return (
    pathname.startsWith('/icons/') ||
    pathname === '/logo.png' ||
    pathname === '/qris-demo.png'
  )
}

// ---------- Fetch router ----------

self.addEventListener('fetch', (event) => {
  const { request } = event

  // Never touch non-GET requests (mutations, socket.io) or cross-origin ones.
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  // Dev tooling passthrough (Turbopack transform-port requests).
  if (url.searchParams.has('XTransformPort')) return
  // POS / order data must always be fresh — straight to the network.
  if (url.pathname.startsWith('/api/')) return

  // Navigations: network-first so dev HMR / fresh HTML is never blocked.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, NAV_TIMEOUT_MS, true))
    return
  }
  // Brand assets (icons, logo — content never changes): cache-first.
  if (isBrandAsset(url.pathname)) {
    event.respondWith(cacheFirst(request))
    return
  }
  // Everything else same-origin — INCLUDING /_next/static/: network-first.
  // In production chunks are content-hashed + `Cache-Control: immutable`, so
  // the browser HTTP cache answers instantly with zero network latency; in
  // dev (stable chunk URLs, code changes constantly) this guarantees fresh
  // code on every reload instead of a stale SW cache.
  event.respondWith(networkFirst(request, 0, false))
})
