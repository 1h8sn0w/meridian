const CACHE_PREFIX = 'meridian-v2-shell-'
const CACHE_NAME = CACHE_PREFIX + 'v1'

const SHELL_HTML = '/'

const SHELL = [
  SHELL_HTML,
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        const open = clients[0]
        return open ? open.focus() : self.clients.openWindow(SHELL_HTML)
      }),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstShell(event))
    return
  }

  if (isCacheableAsset(url)) {
    event.respondWith(cacheFirst(event))
  }
})

async function networkFirstShell(event) {
  try {
    const response = await fetch(event.request)
    if (response.ok && isHtml(response)) {
      cacheInBackground(event, SHELL_HTML, response.clone())
    }
    return response
  } catch (error) {
    const cached = await caches.match(SHELL_HTML)
    if (cached) return cached
    throw error
  }
}

async function cacheFirst(event) {
  const cached = await caches.match(event.request)
  if (cached) return cached

  const response = await fetch(event.request)
  if (response.ok) cacheInBackground(event, event.request, response.clone())
  return response
}

async function precacheShell() {
  const cache = await caches.open(CACHE_NAME)
  await addEach(cache, SHELL)

  const shell = await cache.match(SHELL_HTML)
  if (!shell) return

  const html = await shell.text()
  await addEach(cache, [...new Set(html.match(/\/assets\/[\w.-]+/g) ?? [])])
}

async function addEach(cache, urls) {
  const results = await Promise.allSettled(urls.map((url) => cache.add(url)))
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.warn('Не потрапило в кеш оболонки:', urls[index], result.reason)
    }
  })
}

function cacheInBackground(event, key, response) {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.put(key, response))
      .catch((error) => {
        console.warn('Не вдалося покласти в кеш оболонки:', error)
      }),
  )
}

function isHtml(response) {
  return (response.headers.get('content-type') ?? '').includes('text/html')
}

function isCacheableAsset(url) {
  return (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.webmanifest'
  )
}
