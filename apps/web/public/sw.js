/* ============================================================================
 * Service worker застосунку (MER-51).
 *
 * Дані офлайну вже не потребують: екрани читають SQLite на пристрої й на мережу
 * не чекають ніколи (MER-46, MER-49). Мережа потрібна рівно для оболонки — HTML
 * із SSR, бандлів, іконок, — тож цей воркер кешує ЛИШЕ її.
 *
 * Звідси головне правило: тут БІЛИЙ список, а не чорний. Supabase (`/auth/v1`,
 * `/rest/v1`) і PowerSync (`/sync`) у продакшні живуть на тому самому
 * походженні, що й застосунок (один вхід через Caddy, `compose.yaml`), і кеш
 * там був би або чужою сесією з диска, або тихо застарілими даними. Усе, що не
 * підпадає під умови нижче, воркер не чіпає взагалі.
 *
 * Стратегії:
 *  - навігація: спершу мережа, офлайн — збережений HTML оболонки;
 *  - `/assets/*`: спершу кеш (в іменах хеш вмісту, тож вміст за іменем незмінний);
 *  - маніфест та іконки: спершу кеш, кладуться на install.
 * ========================================================================== */

/* Версію піднімати, коли змінюється набір SHELL, ВМІСТ його файлів (іконка,
 * маніфест) або самі стратегії: інакше на встановлених пристроях лишиться
 * старе — воркер, який не змінився байтами, браузер не перевстановлює.
 * Звичайна зміна застосунку бампа НЕ потребує: навігація мережа-перша, тож
 * новий HTML і нові імена в `/assets/` приїдуть самі. */
const CACHE_PREFIX = 'meridian-v2-shell-'
const CACHE_NAME = CACHE_PREFIX + 'v1'

/* Ключ, під яким лежить оболонка для офлайн-навігації — один на всі адреси.
 * Розмітка в SSR однакова для будь-якого маршруту (до входу видно той самий
 * каркас, `AppGate`), а маршрут визначає клієнтський роутер з адреси. Різниця
 * між сторінками лишається тільки в серіалізованому стані роутера: коли він не
 * збігається з адресою, роутер просто добирає маршрут на клієнті. Це тримається
 * на тому, що жоден маршрут не має серверного лоадера, — з'явиться такий, це
 * місце треба переглянути (офлайн він однаково не відпрацює). */
const SHELL_HTML = '/'

/* Незмінна частина оболонки. Решту — файли збірки з хешем в імені — на install
 * дістаємо з самого HTML: інших джерел їх імен у воркера немає, а без них
 * «встановив і одразу відкрив офлайн» трималося б на HTTP-кеші браузера, тобто
 * на везінні.
 *
 * `SHELL_HTML` тут не для краси: навігацію, якою відкрили сторінку, воркер не
 * перехоплює — він на той момент ще не керує нею, — тож без цього рядка HTML
 * потрапив би в кеш лише з ДРУГОГО завантаження. */
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
    precacheShell()
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
   * завантажитись онлайн, і жоден із них звідти не видаляється — імена з хешем
   * означають, що кожен деплой додає новий набір поверх старого. Обидва кінці
   * лікує список імен зі збірки, тобто плагін збірки; поки що ціна — маршрут,
   * на який жодного разу не заходили, офлайн не відкриється, а кеш повільно
   * росте (переповнення видно у warning нижче й лікується бампом версії). */
  if (isCacheableAsset(url)) {
    event.respondWith(cacheFirst(event))
  }
})

/** Оболонка: свіжа з мережі, а офлайн — та, що збереглась минулого разу. */
async function networkFirstShell(event) {
  try {
    const response = await fetch(event.request)
    /* Перевірка типу — не формальність: за Caddy на цьому ж походженні
     * відповідають GoTrue, PostgREST і PowerSync, і відкрита вручну вкладка з
     * `/rest/v1/` теж є навігацією. Без цієї умови її 200 ліг би під ключ
     * оболонки — і застосунок офлайн стартував би чужим JSON. */
    if (response.ok && isHtml(response)) {
      cacheInBackground(event, SHELL_HTML, response.clone())
    }
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

async function precacheShell() {
  const cache = await caches.open(CACHE_NAME)
  await addEach(cache, SHELL)

  const shell = await cache.match(SHELL_HTML)
  if (!shell) return

  /* Імена файлів збірки дає сам HTML — вони в ньому літералами: modulepreload,
   * стиль і вхідний скрипт. */
  const html = await shell.text()
  await addEach(cache, [...new Set(html.match(/\/assets\/[\w.-]+/g) ?? [])])
}

/* Класти по одному, а не через `cache.addAll`: той усе-або-нічого, і одна
 * невдала іконка лишила б пристрій зовсім без оболонки — причому мовчки, бо
 * `register()` у застосунку про провал install не дізнається. */
async function addEach(cache, urls) {
  const results = await Promise.allSettled(urls.map((url) => cache.add(url)))
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.warn('Не потрапило в кеш оболонки:', urls[index], result.reason)
    }
  })
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
