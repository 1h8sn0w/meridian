# infra — рішення стека

Docker Compose стека, Caddy, PowerSync, образ застосунку й CI. Тут рішення й
правила для тих, хто змінює стек (агента); покрокова установка для людини — у
[`README.md`](README.md).

| Файл | Призначення |
|------|-------------|
| `README.md` | Інструкція для людини: установка, домен, реєстрація, стартовий набір, готовий образ |
| `../compose.yaml` | Увесь стек: init, db, migrate, auth, rest, powersync, caddy |
| `../.env.example` | Необов'язковий: усе має типові значення. Секретів тут немає й не буде |
| `init/generate-secrets.mjs` | Генерує секрети у спільний том при першому запуску |
| `db/roles.sql` | Паролі службових ролей Postgres — раз, під час ініціалізації бази |
| `images/*.Dockerfile` | Похідні образи `init`, `db` (його ж бере `migrate`), `auth`, `powersync`: свіжі пакети Alpine, GoTrue з вихідного коду (нижче, MER-181) |
| `web.Dockerfile` | Образ `caddy`: Caddy зі статичною збіркою `apps/web`. Контекст збірки — корінь репозиторію ([README](caddy/README.md#образ-застосунку)) |
| `caddy-build/main.go` | Точка входу Caddy для власної збірки бінарника ([README](caddy/README.md#що-всередині-образу)) |
| `caddy/Caddyfile` | Єдиний вхід: одне походження, чотири маршрути ([README](caddy/README.md)) |
| `powersync/` | Конфіг PowerSync Service і правила синхронізації ([README](powersync/README.md)) |
| `compose.prebuilt.yaml` | Накладка: усі образи стека готовими з Docker Hub замість збірки |
| `starter-set.example.json` | Вигаданий приклад стартового набору страв (MER-77) — формат і перевірка, не дані |

## Стек одним файлом (MER-43)

**`docker compose up` у корені — і нуль ручних кроків.** Один `compose.yaml`,
сім сервісів: секрети генеруються самі (`init`), схема накочується сама
(одноразовий `migrate`), сервіси знаходять одне одного за іменами. Нічого не
вводиться й не копіюється.

**Конфіги звіряються з першоджерелом, а не з пам'яті.** Для PowerSync це
`powersync-ja/self-host-demo` і JSON-схема `@powersync/service-schema`; для
Supabase — каталог `docker/` репозиторію `supabase/supabase` (звідти ж версії
образів, щоб їх можна було звіряти, і форма `db/roles.sql`); для Caddy —
Dockerfile офіційного образу (`caddyserver/caddy-docker`). Інструкція V2
подекуди застаріла — виграє документація, а розбіжність фіксується тут
(розділ «Розбіжності з інструкцією V2»).

### compose.yaml

- **Версії образів (MER-171)** новіші за офіційний compose Supabase: той пінить
  образи з CVE, для яких уже є виправлення. Тег стороннього образу живе в
  `FROM` його `images/*.Dockerfile` (у GoTrue — `ARG GOTRUE_VERSION` і
  `GOTRUE_COMMIT`), у `compose.yaml` лише PostgREST. Новий тег — це
  реліз-нотатки й міграції між версіями (GoTrue й PowerSync мігрують свої таблиці на старті),
  потім стек із наявним томом і з нуля: вхід, `create_family`, запис через
  PostgREST, `rpc/starter_set`, потік sync. Postgres — лише в межах мажору 17:
  том той самий, `pg_upgrade` не потрібен.
- **`$$` в оболонках сервісів** — екранований долар: Compose перетворює його
  на `$`, і змінна доходить до `sh` нерозкритою. Один `$` Compose підставив би
  сам, порожнім рядком.
- **`db`:** `POSTGRES_PASSWORD` з `app.env` іде в оточення як є (ім'я
  збігається). `POSTGRES_HOST` — сокет: ініціалізація йде від `postgres`
  локально, пароль потрібен лише мережевим підключенням. `roles.sql`
  монтується в `init-scripts/99-roles.sql`: виконується після того, як образ
  завів ролі, і до наших міграцій. Том `db-config` — ключ pgsodium, який образ
  очікує після перезапуску. Порт назовні не публікується.
- **`migrate`** бере той самий образ, що й `db` (у ньому вже є `psql`).
  Стартовий набір монтується з `STARTER_SET_FILE`; не задано — `/dev/null`.
  `create_host_path: false` — хибний шлях зупиняє запуск, а не створює
  порожній каталог.
- **`auth`:** `GOTRUE_MAILER_AUTOCONFIRM=true` типово, бо пошти в стеку немає і
  лист підтвердження нікуди б не пішов (закрити реєстрацію — `README.md`).
- **`auth`, OAuth (MER-162):** `GOTRUE_EXTERNAL_{GOOGLE,DISCORD,GITHUB}_*` з
  `.env`, типово вимкнено. `REDIRECT_URI` = `${APP_URL}/auth/v1/callback`:
  `handle_path /auth/v1/*` віддає його GoTrue, не SPA. `URI_ALLOW_LIST` не
  треба: GoTrue пускає `redirect_to` з хостом `SITE_URL`
  (`IsRedirectURLValid`). `API_EXTERNAL_URL` лишився без `/auth/v1`: OAuth
  вбудованих провайдерів його не бере (лише листи й `custom:`-провайдери).
- **`auth`, прив'язка (MER-163):** `GOTRUE_SECURITY_MANUAL_LINKING_ENABLED=true`
  відкриває `/user/identities/authorize` і `DELETE /user/identities/{id}`.
  `GOTRUE_EXPERIMENTAL_PROVIDERS_WITH_OWN_LINKING_DOMAIN` типово
  `google,discord,github` вимикає автоприв'язку за поштою: у GoTrue v2.199.0
  `DetermineAccountLinking` (`internal/models/linking.go`) рахує пошту
  підтвердженою, якщо `email.Verified || config.Mailer.Autoconfirm`, а GitHub
  (`provider/github.go`) віддає всі адреси з `/user/emails`, і непідтверджені.
  З нашим типовим `AUTOCONFIRM=true` це захоплення акаунта чужим входом.
  З v2.198.0 змінна застаріла, але діє: `ApplyDefaults`
  (`internal/conf/configuration.go`) переносить список у
  `GOTRUE_EXPERIMENTAL_PROVIDER_LINKING_DOMAINS` як `провайдер=провайдер`, тобто
  кожен провайдер і далі у власному домені.
- **`auth`, ліміти (MER-170):** `GOTRUE_RATE_LIMIT_HEADER=X-Real-IP`. Без
  нього GoTrue v2.199.0 не застосовує жодного ліміту за IP
  (`performRateLimitingWithHeader`). Вхід паролем і оновлення токена — лімітер
  `Token`: сплеск 30, далі `GOTRUE_RATE_LIMIT_TOKEN_REFRESH` (150) на 5 хв з
  адреси. `X-Real-IP`, а не `X-Forwarded-For`: GoTrue бере перше значення
  списку, а за довіреним проксі перше значення XFF пише клієнт. Заголовок
  ставить Caddy (`caddy/README.md`). `Sb-Forwarded-For` вимкнений типово
  (`GOTRUE_SECURITY_SB_FORWARDED_FOR_ENABLED`), його не вмикати.
  `GOTRUE_PASSWORD_MIN_LENGTH=10` діє на реєстрацію й зміну пароля; вхід
  коротшим наявним паролем проходить (у відповіді лише поле `weak_password`),
  тож форма вимагає мінімум лише при реєстрації (`NEW_PASSWORD_MIN_LENGTH` в
  `AuthScreen`).
  Ціна: вхід через провайдера без ручної прив'язки створює окремий акаунт
  з `is_sso_user=true`, і `PUT /user` не дає йому задати пароль чи пошту.
  Ручна прив'язка (`linkIdentityToUser`) пошти не звіряє: людина вже увійшла.
  Відв'язати останню ідентичність GoTrue не дає (`single_identity_not_deletable`).
- **`powersync`:** імена `PS_*` обов'язкові — `!env` у `service.yaml` приймає
  лише їх. Healthcheck смикає HTTP-пробу `/probes/liveness`
  (`healthcheck.probes.use_http` у `service.yaml`).
- **`caddy`:** `APP_HOST` (хост із `APP_URL`, `sed` в оболонці) — для
  `default_sni`. Порт усередині = порт ззовні (MER-74): Caddy слухає порт з
  `APP_URL`, без нього — `HTTP_PORT`/`HTTPS_PORT`, тож `${HTTP_PORT}:80`
  відкрив би назовні порт, на якому ніхто не слухає. `PUBLIC_SUPABASE_URL` і
  `PUBLIC_POWERSYNC_URL` — та сама `APP_URL`, бо походження одне.
- **`compose.prebuilt.yaml`:** `build: !reset null` знімає успадкований
  `build` — без нього Compose і збирав би, і тягнув образ. Найбільше економить
  на ARM-хостах, де збірка довша за все решта разом.

## CI/CD (MER-58, MER-108)

Три workflow у `.github/workflows/`:

- `ci.yml` на кожен PR проганяє `pnpm lint`, `typecheck`, `test`,
  `format:check` і `build` — рівно ті самі кореневі скрипти, що й чекліст перед
  PR, нічого свого. Збірка тут, бо Docker Publish іде лише на пуш: без неї
  зламаний `vite build` уперше видно на гілці після злиття. `pnpm` ставить
  `pnpm/action-setup` без `version` (версія — `packageManager`; обидва разом —
  помилка дії), і до `setup-node` з `cache: pnpm`, бо той кличе
  `pnpm store path`. Node 22, як в образі. `--frozen-lockfile`: розбіжність
  лок-файлу валить збірку.
- `docker-publish.yml` на пуш у гілку чи тег `v*` матрицею збирає п'ять
  образів — `meridian` (`web.Dockerfile`, контекст — корінь) і
  `meridian-{db,auth,powersync,init}` (`images/`, контекст — `images/`),
  сканує кожен і публікує на Docker Hub.
  Namespace береться з секрету `DOCKERHUB_USERNAME`, логін — токеном, а не
  паролем (відкликається окремо). Кеш шарів — `type=gha`, окремий `scope` на
  образ, інакше матриця перетирала б кеш одне одному. Скан — шлагбаум
  (MER-174): образ збирається в локальне сховище раннера (`load`;
  `provenance: false`, бо образ з атестацією туди не завантажиться), Scout
  сканує його як `local://meridian:scan`, і лише за 0 Critical/High друга
  збірка публікує теги. Друга збірка — без `no-cache-filters`, тож бере шари
  з кешу першої й публікує рівно проскановані шари. Червоний скан не
  публікує нічого: тег на Docker Hub лишається попереднім, зеленим. Скан
  локального образу не чекає на індексацію реєстру, а саме на щойно
  запушеному дайджесті Scout давав нестабільний 403 (2026-11-23…25).
  **Перезбірка за розкладом (MER-181):** щопонеділка о 04:41 UTC, до Image
  Scan, і вручну (`workflow_dispatch`) той самий workflow бере `ref: staging`
  і публікує лише тег `staging`: runtime-стадії без кешу підтягують свіжі
  пакети Alpine без жодного коміту. `latest`, тег гілки й `sha-*` — лише з
  пушу: інакше розклад, що живе на `main`, назвав би збірку `staging` тегом
  `latest`. Мітки образу (`revision`) тоді беруться з git-checkout
  (`context: git`), а не з події, у якій SHA — `main`. Розклад і кнопку GitHub
  бере з копії файла на `main` (як `image-scan.yml`, MER-149); до релізу пуш у `main` збирати похідні образи не
  може — там немає `images/`. На релізі (MER-109) розклад перемикається на
  `main` і `latest`.
- `image-scan.yml` раз на тиждень сканує вже опублікований `staging`,
  JS-залежності цієї гілки (`pnpm audit`) і сторонні образи стека (MER-171):
  job `scan` — п'ять наших опублікованих образів, job `stack-images` бере з
  `docker compose config` образи сервісів без `build` (після MER-181 це лише
  PostgREST), матриця `stack` сканує кожен із реєстру. Там `only-fixed`: CVE, для якої
  нема виправленої версії пакета, нам нема чим закрити. Червоний скан —
  сигнал шукати новіший тег для `compose.yaml` або чекати на постачальника. Той самий файл лежить і на `main`:
  розклад GitHub бере лише звідти. `latest` додається на релізі (MER-109).

Перші два перелічують у тригерах і `main`, і `staging`, хоч на `main` досі V1:
workflow запускається лише з тієї гілки, в якій він сам лежить. Теги образу
(`latest` — лише з `main` і тегів `v*`, плюс ім'я гілки й short-SHA) і секрети
репозиторію — у [`README.md`](README.md#готовий-образ).

---

## Похідні образи (MER-181)

Реліз — лише з зеленими сканами, а готові образи Supabase й PowerSync
тягнуть Critical/High, для яких виправлення вже є (zlib, openssl, musl в
Alpine; `x/net` і `go-jose` у GoTrue). Upstream їх не перезбирає тижнями, тож
кожен образ стека, крім PostgREST (0/0 і без оболонки), — тонка надбудова в
`images/` з тією ж відповіддю, що й runtime-стадія `caddy`:

- **`db`, `powersync` — `FROM` оригіналу й `apk upgrade`.** `USER`,
  `ENTRYPOINT`, `CMD` і `HEALTHCHECK` успадковуються; PowerSync для
  `apk` перемикається на `root` і повертається на `901`, як в оригіналі.
  Postgres тут із Nix, тож `apk upgrade` чіпає лише базові пакети Alpine, не
  сам сервер.
- **`init` — `node:22-alpine` без npm, npx, corepack і yarn.** Сервіс лише
  запускає `node generate-secrets.mjs` на вбудованих модулях, а всі
  npm-знахідки сканера сиділи у вбудованому npm.
- **`auth` — GoTrue з вихідного коду за тегом**, за зразком
  `caddy-build` і upstream-Dockerfile `supabase/auth`: `git clone` тега з
  перевіркою коміту (`GOTRUE_COMMIT` — тег у git можна пересунути), бамп
  Go-модулів окремим `RUN`, `make auth` (лише один бінарник, не всі
  платформи `make build`). Runtime — `alpine:3.23` з `apk upgrade`, як у
  `caddy` (upstream бере плаваючий `alpine:3`); користувач `supabase` з
  uid 1000 і міграції в `GOTRUE_DB_MIGRATIONS_PATH` — як в оригіналі; симлінка
  `gotrue` немає, compose кличе `auth`. Go-стадія — версія з `go.mod` GoTrue
  (`go 1.27.4`), а не `caddy-build`.
- **Прибрати бамп**, коли upstream оновить модулі: видалити рядок `go get …`
  у `auth.Dockerfile`. Перевірка — `grep` версій у `go.mod` нового тега.
- **Self-host збирає їх сам**, як `caddy`: namespace Docker Hub у
  репозиторії не зашитий (`README.md`, «Готовий образ»), тож `compose.yaml`
  не може назвати опублікований образ. Готові — накладкою
  `compose.prebuilt.yaml` (`IMAGE_NAMESPACE`, `IMAGE_TAG`). `migrate`
  збирається з того самого `build`, що й `db` (якір `&db-build`).

## Caddy й образ застосунку

Один вхід (Caddyfile), образ `caddy` (`web.Dockerfile`, `caddy-build/`), його
CVE-скани й оновлення Caddy — [`caddy/README.md`](caddy/README.md).

---

## Рішення, які тут прийняті

**Секрети генеруються, а не запитуються.** Compose підставляє змінні, коли
ЧИТАЄ файл, — до старту будь-якого контейнера, тож згенерувати секрет і
підставити його в той самий запуск неможливо. Тому сервіси, яким потрібен
секрет, стартують через тонку оболонку: вона читає `/secrets/app.env` і через
`exec` віддає керування рідній команді образу. `exec` обов'язковий — інакше
PID 1 лишається за `sh` і сигнал зупинки не доходить до сервісу.

> **Наслідок.** У образі PostgREST немає навіть `/bin/sh` — він єдиний
> отримує згенерований конфіг-файл. Файли в томі мають права 0644, а не 0600:
> GoTrue, PostgREST і PowerSync працюють не від root (uid `supabase`, 1000 і
> 901).

**`generate-secrets.mjs`:** `app.env` читає `sh`, тож рядки `KEY=VALUE` без
пробілів і лапок (значення — hex і base64url). `JWT_SECRET` — 64 hex (GoTrue
вимагає ≥ 32 символів), один на стек: ним PostgREST і PowerSync перевіряють
токени (MER-46). Anon-ключ — HS256 у формі `generate-keys.sh` Supabase
(`role`, `iss: supabase`) зі строком 10 років: це конфіг сервісів, а не сесія,
і коротший строк одного дня мовчки зупинив би самохост. `db-uri` PostgREST —
під `authenticator`, звідки він перемикається на `anon`/`authenticated` за
claim `role`.

**Постачальник даних — не весь Supabase, а три його сервіси.** Офіційний
self-host — це ~11 контейнерів; застосунок звертається до трьох (GoTrue,
PostgREST, Postgres). Studio, Realtime, Storage, edge-функції, аналітика,
supavisor у коді не згадуються. Разом з ними пішли дві пастки старої
установки: орендар supavisor у рядках підключення й накладка, яку Compose
мовчки ігнорує без `COMPOSE_FILE`. Каталог старої установки
`/supabase-project/` ігнорує `.gitignore`.

> Схема це витримує, бо не залежить від Supabase: RLS читає GUC
> `request.jwt.claims` напряму, гранти `supabase_auth_admin` — під
> `IF EXISTS` (MER-44/45). Ролі `anon`, `authenticated`, `service_role`,
> `authenticator`, `supabase_auth_admin` приходять з образу
> `supabase/postgres`. `db/roles.sql` видає пароль лише двом, що входять у базу
> по мережі (`authenticator` — PostgREST, `supabase_auth_admin` — GoTrue);
> решті (`pgbouncer`, `supabase_storage_admin`, `supabase_functions_admin`)
> свідомо ні. Пароль — через `\set` зі змінної, яку приносить оболонка `db`.

**Хук доступу — рядок у `compose.yaml`, а не крок установки.** Без
`GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_*` GoTrue не покличе
`public.custom_access_token_hook`, у токені не буде claim `family_id`, і
застосунок не побачить жодного рядка — мовчки (MER-45).

**Схему накочує стек, а не людина.** `migrate` — одноразовий сервіс, і все, що
працює з даними, чекає на його успішне завершення
(`service_completed_successfully`): застосунок не стартує на базі без таблиць,
RLS і хука. Як саме — `packages/db/README.md` (MER-69).

**Сховище бакетів — Postgres, не MongoDB.** Mongo — це +2 сервіси й окремий
рушій БД. Postgres як bucket storage підтримується офіційно з 1.3.8; PowerSync
створює власну схему в указаній базі сам.

> **Наслідок для схеми (MER-44).** Сховище живе в тій самій базі, яку PowerSync
> реплікує, тому публікація `powersync` перелічує таблиці явно
> (`0002_replication.sql`, далі `ALTER PUBLICATION … ADD TABLE`). `FOR ALL
> TABLES` затягнув би в реплікацію власні таблиці PowerSync і зациклив сервіс.

**Реплікація йде прямо в `db`.** Логічна реплікація потребує прямого
з'єднання, пулер її ламає; пулера в стеку немає, `PS_DATABASE_URI` дивиться на
`db:5432`, без TLS усередині мережі.

**Користувач реплікації — поки що `postgres`**, як в офіційному демо.
`powersync_role` (`LOGIN REPLICATION BYPASSRLS` + `SELECT`) уже заводить
MER-44, але **без пароля** — секрети в git не потрапляють.

**PowerSync перевіряє токени спільним секретом, а не JWKS** (MER-46). GoTrue у
self-host досі підписує токени симетричним ключем: `kid` немає, а
`/.well-known/jwks.json` віддає `{"keys":[]}`. Тому в `service.yaml` поруч із
`jwks_uri` стоїть `supabase_jwt_secret`. Без нього sync відповідає
`401 PSYNC_S2101`, і виглядає це як «правила не працюють». Обидва способи
поруч навмисно: після переходу на асиметричні ключі JWKS почне вигравати сам.

**Сервера застосунку немає — лише файли й конфіг.** Від стека потрібен рівно
публічний конфіг (`PUBLIC_*`), і його Caddy вписує в `/env.js` шаблоном.
З `app.env` Caddy бере лише anon-ключ і читає файл у підоболонці: шаблон уміє
вивести в сторінку будь-яку змінну оточення, тож `JWT_SECRET` і пароль бази в
оточення Caddy не потрапляють.

---

## Перевірка на живому стеку

```bash
docker compose logs auth | grep -i error
docker compose logs powersync | grep "New checkpoint"
```

Перша — що в токені є `family_id`, інакше RLS не покаже жодного рядка
(MER-45). Друга — що бакет сім'ї зійшовся: після входу в логах PowerSync
з'являється `family_data|0["<family_id>"]`, тобто claim доїхав і правила його
прочитали (MER-46). Порожньо й без помилок — див.
абзац про хук доступу вище.

---

## Розбіжності з інструкцією V2

| В інструкції | Насправді | Джерело |
|--------------|-----------|---------|
| конфіг називається `powersync.yaml` | `service.yaml` (+ окремий `sync-config.yaml`), шлях задається `POWERSYNC_CONFIG_PATH` | `powersync-ja/self-host-demo` |
| `client_auth.allow_local_jwks` вмикає локальні JWKS-адреси | такого ключа більше немає; є зворотний `block_local_jwks` (типово `false`) | JSON-схема `@powersync/service-schema` |
| «bucket по `family_id`» | бакети — legacy `bucket_definitions`; актуальні Sync Streams з `config: edition: 3`, параметр — `auth.parameter('family_id')` | docs.powersync.com/sync/streams |
| для перевірки токенів досить `PS_JWKS_URL` | self-host GoTrue лишається на HS256, JWKS порожній — потрібен ще `client_auth.supabase_jwt_secret` | розділ вище, перевірено на живому стеку |

Імена змінних із контракту (`PS_DATABASE_URI`, `PS_JWKS_URL`, `PUBLIC_*`)
збережено: у конфізі PowerSync вони підставляються через `!env`, а той приймає
будь-яке ім'я з префіксом `PS_`.
