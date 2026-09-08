const CACHE_VERSION = 'fym-v5-20260908'
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
]

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)

  // For API requests (price data) - network only, no cache
  if (url.hostname === 'api.coingecko.com' || url.hostname.includes('yahoo')) {
    event.respondWith(fetch(event.request).catch(() => new Response('', { status: 503 })))
    return
  }

  // For Google Fonts - cache first, long-lived
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open('google-fonts').then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached
          return fetch(event.request).then(res => {
            if (res.ok) cache.put(event.request, res.clone())
            return res
          })
        })
      )
    )
    return
  }

  // For navigation requests - network first, fallback to cache
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const clone = res.clone()
          caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone))
          return res
        })
        .catch(() => caches.match('/index.html'))
    )
    return
  }

  // For JS/CSS/assets - stale-while-revalidate
  event.respondWith(
    caches.open(CACHE_VERSION).then(cache =>
      cache.match(event.request).then(cached => {
        const fetchPromise = fetch(event.request).then(res => {
          if (res.ok) cache.put(event.request, res.clone())
          return res
        })
        return cached || fetchPromise
      })
    )
  )
})
