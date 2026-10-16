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
| `web.Dockerfile` | Образ `caddy`: Caddy зі статичною збіркою `apps/web`. Контекст збірки — корінь репозиторію ([README](caddy/README.md#образ-застосунку)) |
| `caddy-build/main.go` | Точка входу Caddy для власної збірки бінарника ([README](caddy/README.md#що-всередині-образу)) |
| `caddy/Caddyfile` | Єдиний вхід: одне походження, чотири маршрути ([README](caddy/README.md)) |
| `powersync/` | Конфіг PowerSync Service і правила синхронізації ([README](powersync/README.md)) |
| `compose.prebuilt.yaml` | Накладка: `caddy` готовим образом замість збірки |
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

- `ci.yml` на кожен PR проганяє `pnpm lint`, `typecheck`, `test` і
  `format:check` — рівно ті самі кореневі скрипти, нічого свого. `pnpm` ставить
  `pnpm/action-setup` без `version` (версія — `packageManager`; обидва разом —
  помилка дії), і до `setup-node` з `cache: pnpm`, бо той кличе
  `pnpm store path`. Node 22, як в образі. `--frozen-lockfile`: розбіжність
  лок-файлу валить збірку.
- `docker-publish.yml` на пуш у гілку чи тег `v*` збирає `web.Dockerfile`
  (контекст — корінь), сканує образ і публікує `meridian` на Docker Hub.
  Namespace береться з секрету `DOCKERHUB_USERNAME`, логін — токеном, а не
  паролем (відкликається окремо). Кеш шарів — `type=gha`. Скан іде після push і
  за дайджестом щойно зібраного образу: це тривога, а не шлагбаум (свіжа CVE в
  базі інакше глушила б публікацію), і паралельна публікація не підмінить
  перевірене.
- `image-scan.yml` раз на тиждень сканує вже опубліковані `staging` і `latest`.

Перші два перелічують у тригерах і `main`, і `staging`, хоч на `main` досі V1:
workflow запускається лише з тієї гілки, в якій він сам лежить. Теги образу
(`latest` — лише з `main` і тегів `v*`, плюс ім'я гілки й short-SHA) і секрети
репозиторію — у [`README.md`](README.md#готовий-образ).

---

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
публічний конфіг (`PUBLIC_*`), і його Caddy вписує в `index.html` шаблоном.
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
