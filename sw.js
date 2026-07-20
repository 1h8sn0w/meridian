/* ============================================================================
 * Service worker застосунку «Меридіан» (MER-19: PWA + офлайн).
 *
 * Дані користувача живуть у localStorage і мережі не потребують — тут
 * кешується лише «оболонка»: index.html, маніфест, іконки та вендорні скрипти.
 *
 * Стратегії:
 *  - навігація (відкриття сторінки) — спершу мережа, щоб оновлення доходили
 *    одразу; без мережі — index.html з кешу;
 *  - решта (іконки, вендор, маніфест) — спершу кеш, мережа як запасний
 *    варіант із докешуванням.
 *
 * Відносні шляхи — застосунок працює і з кореня (localhost:8137),
 * і з підшляху (github.io/meridian/).
 * ========================================================================== */

/* Підняти версію, коли змінюється склад SHELL або вендорні файли —
 * старий кеш зітреться під час activate. index.html свіжішає сам (мережа
 * на кожній навігації), тож правки застосунку бампа не потребують. */
const CACHE_PREFIX = "meridian-shell-";
const CACHE_NAME = CACHE_PREFIX + "v1";

const SHELL = [
  "./index.html",
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
      /* Нова версія стає чинною одразу, без очікування закриття вкладок. */
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      /* Лише СВОЇ старі кеші (префікс meridian-shell-). Cache Storage спільний
       * на весь origin — не чіпаємо кеші інших застосунків (MER-36). */
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;

  /* Навігація: мережа → кеш. Свіжу відповідь кладемо під ключ index.html,
   * щоб офлайн-запасний варіант завжди був останньою баченою версією
   * (query на кшталт ?selftest ключа не роздрібнює). */
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

  /* Статика: кеш → мережа з докешуванням успішних відповідей. */
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
