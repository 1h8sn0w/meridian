/* ============================================================================
 * Service worker застосунку (MER-51).
 *
 * Дані офлайну вже не потребують: екрани читають SQLite на пристрої й на мережу
 * не чекають ніколи (MER-46, MER-49). Мережа потрібна рівно для оболонки — HTML
 * із SSR, бандлів, іконок, — тож цей воркер кешує ЛИШЕ її.
 *
 * Звідси головне правило: тут БІЛИЙ список шляхів, а не чорний. Supabase
 * (`/auth/v1`, `/rest/v1`) і PowerSync (`/sync`) у продакшні живуть на тому
 * самому походженні, що й застосунок (один вхід через Caddy, `compose.yaml`), і
 * кеш там був би або чужою сесією з диска, або тихо застарілими даними. Усе, що
 * не перелічене нижче, воркер не чіпає взагалі.
 *
 * Стратегії:
 *  - навігація: спершу мережа, офлайн — збережений HTML оболонки;
 *  - `/assets/*`: спершу кеш (в іменах хеш вмісту, тож вміст за іменем незмінний);
 *  - маніфест та іконки: спершу кеш, кладуться на install.
 * ========================================================================== */

/* Версію піднімати, коли змінюється НАБІР SHELL або самі стратегії. activate
 * видаляє попередні кеші Meridian. Навігація мережа-перша, тож звичайна зміна
 * застосунку бампа не потребує: новий HTML і нові імена в `/assets/` приїдуть
 * самі. */
const CACHE_PREFIX = 'meridian-v2-shell-'
const CACHE_NAME = CACHE_PREFIX + 'v1'

/* Ключ, під яким лежить оболонка для офлайн-навігації. Усі маршрути SSR-ляться
 * в ОДНАКОВУ розмітку (до входу видно той самий каркас, `AppGate`), а маршрут
 * далі визначає клієнтський роутер з адреси. Тому фолбек один на всі адреси, і
 * рядки запиту його не фрагментують. */
const SHELL_HTML = '/'

/* Незмінна частина оболонки — єдине, що можна покласти наперед: імена решти
 * файлів збірки містять хеш вмісту й відомі лише самій збірці.
 *
 * `SHELL_HTML` тут не для краси: без нього перший візит лишився б без оболонки
 * в кеші. Навігацію, якою відкрили сторінку, воркер не перехоплює — він на той
 * момент ще не керує нею, — тож HTML потрапив би в кеш лише з ДРУГОГО
 * завантаження, і «встановив і одразу відкрив офлайн» не спрацювало б. */
const SHELL = [
  SHELL_HTML,
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL))
      /* Не чекати закриття вкладок: користувач щойно відкрив застосунок, і
       * оболонка має опинитись у кеші вже з цього візиту. */
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      /* Cache Storage спільний на все походження — чистимо лише своє. */
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

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstShell(event))
    return
  }

  /* ponytail: у кеш потрапляють лише ті чанки маршрутів, які встигли
   * завантажитись онлайн. Маршрут, на який жодного разу не заходили (і якого не
   * підтягнув `defaultPreload: 'intent'`), офлайн покаже порожній екран. Повний
   * прекеш потребує списку імен зі збірки — тобто плагіна збірки; додати, коли
   * це справді почне заважати. */
  if (isCacheableAsset(url)) {
    event.respondWith(cacheFirst(event))
  }
})

/** Оболонка: свіжа з мережі, а офлайн — та, що збереглась минулого разу. */
async function networkFirstShell(event) {
  try {
    const response = await fetch(event.request)
    if (response.ok) cacheInBackground(event, SHELL_HTML, response.clone())
    return response
  } catch (error) {
    const cached = await caches.match(SHELL_HTML)
    if (cached) return cached
    /* Кеша немає — віддаємо помилку далі, щоб браузер показав свою офлайн-
     * сторінку, а не порожню білу. */
    throw error
  }
}

/** Незмінні файли: з кешу, а чого нема — з мережі й одразу в кеш. */
async function cacheFirst(event) {
  const cached = await caches.match(event.request)
  if (cached) return cached

  const response = await fetch(event.request)
  if (response.ok) cacheInBackground(event, event.request, response.clone())
  return response
}

/* Запис у кеш НЕ можна чекати перед тим, як віддати відповідь сторінці: SSR
 * віддає HTML потоком, і поки другу гілку `clone()` ніхто не читає, вона
 * притискає першу — сторінка чекала б на власний же запис. `waitUntil` тримає
 * воркер живим, доки запис завершиться. */
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

function isCacheableAsset(url) {
  return (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.webmanifest'
  )
}
