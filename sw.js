/* ============================================================================
 * Meridian service worker (MER-19: PWA + offline).
 *
 * User data lives in localStorage and does not need the network. This worker
 * caches only the application shell: index.html, demo source data, compiled
 * styles, the manifest, icons, and vendored scripts.
 *
 * Strategies:
 *  - navigation: network first, cached index.html offline;
 *  - tailwind.css and data/demo-recipes.js: network first, cached fallback;
 *  - icons, vendored scripts, and manifest: cache first, then network.
 *
 * Relative paths support both a root deployment (localhost:8137) and a
 * subpath deployment (github.io/meridian/).
 * ========================================================================== */

/* Increment this version when SHELL membership or vendored files change.
 * activate removes the previous shell cache. Navigation is network-first, so
 * an index.html-only application change does not require a cache bump. */
const CACHE_PREFIX = "meridian-shell-";
const CACHE_NAME = CACHE_PREFIX + "v3";

const SHELL = [
  "./index.html",
  "./data/demo-recipes.js",
  "./tailwind.css",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./vendor/pdfjs/pdf.min.js",
  "./vendor/pdfjs/pdf.worker.min.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL))
      /* Activate the new worker without waiting for existing tabs to close. */
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      /* Cache Storage is origin-wide; delete only Meridian's old caches. */
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const requestUrl = new URL(req.url);
  if (requestUrl.origin !== self.location.origin) return;

  /* Navigation uses network first. Store successful responses under the
   * canonical index.html key so query strings do not fragment the fallback. */
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy));
          }
          return res;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  /* Revalidate mutable shell assets so a new index.html is not paired with
   * stale source data or styles. Keep a cached offline fallback. */
  const isRevalidatedAsset =
    requestUrl.pathname.endsWith("/tailwind.css") ||
    requestUrl.pathname.endsWith("/data/demo-recipes.js");
  if (isRevalidatedAsset) {
    const revalidatedRequest = new Request(req, { cache: "no-cache" });
    const networkResponse = fetch(revalidatedRequest);
    const cacheUpdate = networkResponse
      .then(async (res) => {
        if (!res.ok) return;
        try {
          const copy = res.clone();
          const cache = await caches.open(CACHE_NAME);
          await cache.put(req, copy);
        } catch (error) {
          console.warn("Не вдалося оновити кеш ресурсу оболонки " + req.url + ":", error);
        }
      })
      /* respondWith below handles network failure through the cached fallback. */
      .catch(() => {});
    event.waitUntil(cacheUpdate);
    event.respondWith(
      networkResponse
        .then((res) => {
          if (!res.ok) {
            throw new Error(
              "Ресурс оболонки не оновлено (" + requestUrl.pathname + "): HTTP " + res.status,
            );
          }
          return res;
        })
        .catch(async (error) => {
          const cached = await caches.match(req, { ignoreSearch: true });
          if (cached) return cached;
          throw error;
        })
    );
    return;
  }

  /* Remaining static assets use cache first and cache successful responses. */
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
    )
  );
});
