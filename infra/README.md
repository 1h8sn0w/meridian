# infra — self-host

Інфраструктура V2: наш Docker Compose, Caddyfile, конфіг PowerSync і приклад
`.env`. Supabase сюди **не** копіюється — він піднімається окремо власним
офіційним compose.

| Файл | Призначення |
|------|-------------|
| `docker-compose.yml` | Рівно три сервіси: `web`, `powersync`, `caddy`. Підключаються до мережі Supabase як до зовнішньої |
| `docker-compose.prebuilt.yml` | Той самий стек для будь-якого хосту без клонування репозиторію: `web` бере готовий образ з реєстру (`WEB_IMAGE`) замість локальної збірки (MER-58) |
| `web.Dockerfile` | Прод-образ `apps/web`. Контекст збірки — корінь репозиторію (pnpm-воркспейс) |
| `caddy/Caddyfile` | Два хости — застосунок і sync-ендпоінт. HTTPS Caddy бере сам |
| `powersync/service.yaml` | Конфіг PowerSync Service, монтується лише для читання |
| `powersync/sync-config.yaml` | Правила синхронізації (MER-46): один стрім на сім'ю, сім таблиць |
| `supabase/docker-compose.override.yml` | Накладка на compose **Supabase**: вмикає хук доступу (MER-45). Копіюється туди, не запускається звідси |
| `.env.example` | Контракт змінних; секретні значення порожні |

---

## Швидкий шлях

```bash
corepack pnpm bootstrap
```

`infra/bootstrap.mjs` робить усе, що описано нижче: бере офіційний compose
Supabase, генерує секрети **його ж** скриптом, вмикає хук доступу, піднімає
стек, застосовує міграції й заповнює `infra/.env` та `apps/web/.env`. Далі —
`corepack pnpm dev`. З `--full` додатково піднімає наші три сервіси.

Скрипт ідемпотентний: повторний запуск нічого не перегенеровує й наявні `.env`
не чіпає. Ручні кроки нижче лишаються джерелом істини про те, **що саме** він
робить і чому.

---

## Запуск руками

Порядок обов'язковий: **спершу Supabase, потім наш стек** — наш compose
приєднується до вже створеної мережі Supabase.

### 1 · Supabase

Офіційний self-hosted Supabase — це ~11 сервісів у власному
`docker-compose.yml`. **Руками його не дублювати й не переписувати.** Клонувати
офіційне репо й узяти каталог `docker/` як є:

```bash
git clone --depth 1 https://github.com/supabase/supabase
cp -rf supabase/docker/* supabase-project
cp supabase/docker/.env.example supabase-project/.env
```

Далі — згенерувати секрети (`sh utils/generate-keys.sh`,
`sh utils/add-new-auth-keys.sh` у каталозі проєкту) і замінити **всі** дефолтні
значення в `.env`.

**Обов'язковий крок MER-45:** покласти поруч накладку, яка вмикає хук доступу.
Без неї в JWT не буде claim `family_id` — і застосунок не побачить жодного
рядка, мовчки:

```bash
cp infra/supabase/docker-compose.override.yml supabase-project/
```

⚠️ **І дописати її в `COMPOSE_FILE`.** Ім'я `docker-compose.override.yml`
Compose підхоплює сам лише доти, доки `COMPOSE_FILE` не задано, — а Supabase у
своєму `.env` його задає. Тому там має стати:

```
COMPOSE_PATH_SEPARATOR=:
COMPOSE_FILE=docker-compose.yml:docker-compose.override.yml
```

Роздільник задається явно, бо типовий залежить від ОС. Не зробити цього —
найдорожча помилка всієї установки: стек піднімається, реєстрація й RPC
працюють, а даних клієнт не бачить ніколи й ніде не бачить помилки.

Локально ще варто ввімкнути `ENABLE_EMAIL_AUTOCONFIRM=true` у `.env` Supabase:
SMTP у типовому self-host не налаштований, тож лист із підтвердженням нікуди не
піде й акаунт лишиться неактивованим.

І там же — `POOLER_TENANT_ID=meridian` замість заглушки `your-tenant-id`: це
ім'я орендаря supavisor, воно видно в кожному рядку підключення з хоста й у
логах пулера. Те саме значення має стояти в `infra/.env` — саме з нього
збирається `DATABASE_URL`. Перейменовувати вже піднятий стек не варто:
`volumes/pooler/pooler.exs` заводить орендаря, лише якщо такого ще немає, тож
вийде другий, а старі рядки підключення перестануть працювати.

Запуск:

```bash
cd supabase-project && docker compose up -d
```

Каталог `supabase-project/` у наш репозиторій не комітиться — це чужий код зі
своїм життєвим циклом. Тримати його поруч із репозиторієм або в іншому місці.

Після старту: Studio і REST — на `http://localhost:8000`, Postgres через пулер
supavisor — на `localhost:5432` (користувач `postgres.meridian`, session-режим;
6543 — той самий пулер у transaction-режимі).

### 2 · Наш стек

```bash
cp infra/.env.example infra/.env
```

Заповнити `infra/.env`: `POSTGRES_PASSWORD`, `ANON_KEY`, `SERVICE_ROLE_KEY` —
ті самі значення, що в `.env` Supabase. Решта має робочі локальні дефолти;
`PUBLIC_SUPABASE_ANON_KEY` підставляється з `ANON_KEY` сам.

```bash
docker compose -f infra/docker-compose.yml up -d
```

### 3 · Перевірка

```bash
docker compose -f infra/docker-compose.yml ps
```

| Що | Де |
|----|-----|
| Supabase Studio | `http://localhost:8000` |
| PowerSync health | `http://localhost:8080/probes/liveness` → `200` |
| Застосунок | `https://localhost` (через Caddy) |
| Sync-ендпоінт | `https://sync.localhost` (через Caddy) |

Локально Caddy підписує сертифікати власним внутрішнім CA, тому браузер спершу
лається на невідомий центр сертифікації. Це очікувано: сертифікат від
Let's Encrypt з'явиться сам, щойно в `APP_HOST`/`SYNC_HOST` буде реальний домен.
Health-ендпоінт PowerSync відкритий і напряму на петлі — щоб перевірка не
залежала від довіри до локального CA.

Зупинка:

```bash
docker compose -f infra/docker-compose.yml down
```

---

## Як розгорнути готовий образ

Замість збірки `web` з вихідників (крок 2 вище) можна забрати вже зібраний
образ із Docker Hub. Тоді хостинг не вимагає ні клонувати репозиторій, ні мати
на машині Node з pnpm — досить Docker.

```bash
docker pull <namespace>/meridian:staging
```

`<namespace>` — власник образу в реєстрі, тобто той самий обліковий запис, що
в секреті `DOCKERHUB_USERNAME` (таблиця нижче). У репозиторії конкретне ім'я
ніде не зашите: compose бере образ зі змінної `WEB_IMAGE` в `infra/.env`, а
workflow — із секрету. Форку, що публікує у свій namespace, правити нічого.

Публікує образ `.github/workflows/docker-publish.yml` (MER-58) — той самий
`infra/web.Dockerfile`, лише зібраний на CI.

### Теги

| Тег | Звідки береться |
|-----|-----------------|
| `latest` | пуш у гілку за замовчуванням (`main`) і git-тег `vX.Y.Z` |
| `staging` | пуш у `staging` — поки V2 живе саме там, це найсвіжіший образ |
| `main` | пуш у `main` |
| `sha-<короткий-sha>` | кожен пуш — щоб відкотитись на конкретний коміт |
| `X.Y.Z` | git-тег `vX.Y.Z` |

До злиття `staging` → `main` тег `latest` не оновлюється: на `main` усе ще
статичний V1 без `apps/web`, і сам workflow туди ще не потрапив. Для self-host
V2 сьогодні брати `staging` або конкретний `sha-…`.

### Автономний запуск, без Compose

```bash
docker run -p 3000:3000 \
  -e PUBLIC_SUPABASE_URL=... \
  -e PUBLIC_SUPABASE_ANON_KEY=... \
  -e PUBLIC_POWERSYNC_URL=... \
  -e POWERSYNC_URL=... \
  <namespace>/meridian:staging
```

Змінні — ті самі, що й у `infra/.env` (крок 2 вище): три `PUBLIC_*` їдуть у
браузер, `POWERSYNC_URL` потрібен серверу. Порт слухається з `PORT`, типово
`3000`. Це лише сам застосунок — Supabase і PowerSync мають бути підняті
окремо, інакше йому нема з чим говорити.

### У складі `docker-compose.yml`

У сервісі `web` закоментувати `build:` і розкоментувати рядок `image:` — він
там уже стоїть, — а сам образ задати в `infra/.env`:

```yaml
web:
  image: ${WEB_IMAGE}
  # build:
  #   context: ..
  #   dockerfile: infra/web.Dockerfile
```

```
WEB_IMAGE=<namespace>/meridian:staging
```

Далі `docker compose -f infra/docker-compose.yml up -d` підтягне образ сам;
оновити його потім — `docker compose -f infra/docker-compose.yml pull web`.
PowerSync, Caddy й мережа Supabase лишаються без змін: образ стосується тільки
`web`.

### Секрети репозиторію

Workflow нічого не публікує, доки в налаштуваннях репозиторію
(Settings → Secrets and variables → Actions) не з'являться два секрети:

| Секрет | Значення |
|--------|----------|
| `DOCKERHUB_USERNAME` | ім'я користувача Docker Hub — воно ж namespace, у який публікується образ |
| `DOCKERHUB_TOKEN` | **access token** Docker Hub із правом `Read & Write`, не пароль акаунта |

Токен, а не пароль: його видно в списку, можна відкликати окремо й він не
відмикає сам акаунт. Без секретів крок логіну падає — образ не публікується,
але код у репозиторії від цього не страждає.

---

## Віддалений хост (готовий образ + свій домен)

Той самий стек, але без клонування репозиторію —
`infra/docker-compose.prebuilt.yml` замість `infra/docker-compose.yml`. На хост
переносяться лише чотири речі: сам файл, заповнений `infra/.env`, і каталоги
`powersync/` та `caddy/` — без змін. `apps/`, `packages/`, `web.Dockerfile` не
потрібні, образ уже зібраний на CI.

**Порядок — той самий, що й у «Запуск руками» вище:** спершу Supabase
(розділ «1 · Supabase» — не міняється залежно від хоста), потім цей файл. Якщо
Supabase на хості ще нема — почати з нього.

1. Тека на хості, наприклад `/srv/meridian/`: покласти туди
   `docker-compose.prebuilt.yml`, `powersync/`, `caddy/`.
2. `cp infra/.env.example infra/.env` → заповнити, як у кроці 2 «Запуску
   руками», і додати образ та реальний домен:
   ```
   WEB_IMAGE=<namespace>/meridian:staging
   APP_HOST=app.example.com
   SYNC_HOST=sync.example.com
   ```
   Обом іменам — A/AAAA-записи на публічну IP хоста (або DDNS-ім'я).
3. Порти **80 і 443** мають доходити до хоста ззовні (TCP; 443 ще й UDP — для
   HTTP/3); за NAT це проброс на роутері. Caddy сам візьме сертифікат
   Let's Encrypt, щойно домен резолвиться й порти відкриті — жодних ручних
   ACME-кроків.
4. ⚠️ І мають бути вільні на самому хості. Вбудована веб-панель керування чи
   інший реверс-проксі часто вже слухають 80/443 — тоді Caddy впаде на
   біндингу порту, а в GUI-обгортках над Compose це не завжди видно як явну
   помилку.
5. `docker compose -f docker-compose.prebuilt.yml up -d`. Через GUI (Portainer,
   Container Manager тощо) — імпорт теки з кроку 1; такі обгортки зазвичай
   очікують ім'я `docker-compose.yml`, тож файл варто перейменувати або вказати
   назву явно, а `.env` вони підхоплюють із тієї ж теки самі.
6. Міграції (`pnpm db:migrate`) — з робочої машини, не з хоста: `DATABASE_URL`
   тимчасово вказати на хост через LAN/VPN. Порт 5432 (supavisor) назовні
   постійно не виносити — крім пароля Postgres, там більше нічого не захищає.

Тег у `WEB_IMAGE` — `staging`, той самий принцип, що й у таблиці тегів вище:
зміниться на `latest` після злиття `staging` → `main`.

---

## Рішення, які тут прийняті

**Сховище бакетів — Postgres, не MongoDB.** Демо PowerSync використовує
MongoDB, але це +2 сервіси (сам Mongo і ініціалізація реплікасету) й окремий
рушій БД. Postgres як bucket storage підтримується офіційно з версії 1.3.8;
PowerSync створює власну схему в указаній базі сам, тому бутстрап не потрібен і
`docker compose up -d` працює одразу. Так стек лишається рівно з трьох сервісів.

> **Наслідок для схеми (зроблено в MER-44).** Сховище живе в тій самій базі,
> яку PowerSync реплікує, тому публікація `powersync` перелічує таблиці явно —
> `CREATE PUBLICATION powersync FOR TABLE ...` у міграції
> `packages/db/drizzle/0002_replication.sql`. Варіант `FOR ALL TABLES` затягнув
> би в реплікацію власні таблиці PowerSync і зациклив сервіс. Нову таблицю
> треба додавати в публікацію руками — інакше вона не поїде на пристрої.
> Так і зроблено в MER-55: `0003_prefs_shopping.sql` доповнює публікацію
> через `ALTER PUBLICATION powersync ADD TABLE`.

**Реплікація — прямо в `db`, не через supavisor.** Логічна реплікація потребує
прямого з'єднання, пулер її ламає. Тому `PS_DATABASE_URI` дивиться на
`supabase-db:5432`, а хостовий `DATABASE_URL` для drizzle-kit — на
`localhost:5432` (це вже supavisor). Це різні адреси свідомо.

**Користувач реплікації — поки що `postgres`.** Так робить офіційне демо
PowerSync. Виділену роль `powersync_role` (`LOGIN REPLICATION BYPASSRLS` +
`SELECT` на таблицях схеми) уже заводить міграція MER-44, але **без пароля** —
секрети в git не потрапляють, а без пароля роль не може ввійти. Тому реплікація
й далі йде під `postgres`, доки перемикання не зроблять руками:

```bash
docker exec -it supabase-db psql -U postgres -c "ALTER ROLE powersync_role WITH PASSWORD 'НОВИЙ_ПАРОЛЬ';"
```

Далі в `infra/.env` замінити користувача в `PS_DATABASE_URI` на
`powersync_role` і перезапустити сервіс `powersync`. `PS_STORAGE_URI` лишається
під `postgres`: сховище бакетів PowerSync створює власну схему, а на це прав
`powersync_role` немає свідомо — реплікаційна роль має вміти лише читати.

**Caddy проксіює два хости, не три.** Supabase лишається на власному kong'і
(`http://localhost:8000`) — так задано в інструкції V2. Якщо колись знадобиться
HTTPS і для Supabase, це ще один блок у `Caddyfile`, без нових сервісів.

**`web` не під'єднаний до мережі Supabase — і вже не буде.** Тут очікувалося, що
MER-45 приведе SSR до GoTrue й доведеться додати сервісу `web` мережу
`supabase`. Не довелося: вхід робить браузер, сесія живе на пристрої, а сервер
про неї не знає свідомо — інакше застосунок перестав би бути local-first. Від
сервера потрібен лише публічний конфіг (`PUBLIC_SUPABASE_URL`,
`PUBLIC_SUPABASE_ANON_KEY`), який він віддає під час SSR.

**PowerSync перевіряє токени спільним секретом, а не JWKS** (MER-46). Офіційний
self-hosted Supabase досі підписує токени симетричним ключем: у них немає `kid`,
а `/auth/v1/.well-known/jwks.json` віддає `{"keys":[]}`. Тому в `service.yaml`
поруч із `jwks_uri` стоїть `supabase_jwt_secret: !env PS_JWT_SECRET`, а в
`.env` — `JWT_SECRET` із `.env` самого Supabase. Без нього sync відповідає
`401 PSYNC_S2101` («no key matched the token KID»), і виглядає це як «правила не
працюють», хоч і правила, і claim правильні. Обидва способи лишаються поруч
навмисно: після переходу на асиметричні ключі (`utils/add-new-auth-keys.sh`)
JWKS наповниться й почне вигравати сам.

**Перевірити синхронізацію на живому стеку:**

```bash
docker logs meridian-powersync-1 | grep "Sync stream started"
```

Після входу в застосунок у логах має з'явитися `New checkpoint` із бакетом
`family_data|0["<family_id>"]` — це і є доказ, що claim доїхав і правила його
прочитали. Порожньо й без помилок — див. абзац про хук доступу нижче.

**Хук доступу вмикається на боці Supabase, а не нашого стека** (MER-45). Claim
`family_id` у JWT кладе Postgres-функція з міграції
`packages/db/drizzle/0004_auth.sql`, але кличе її GoTrue — і лише якщо їй про це
сказали двома змінними середовища. В офіційному compose Supabase їх немає, тому
поруч кладеться `infra/supabase/docker-compose.override.yml`. Перевірити на
живому стеку можна так: увійти, взяти `access_token` і подивитися його вміст —
`family_id` має бути **верхнього рівня**. Немає claim — RLS не покаже жодного
рядка, а sync-правила (MER-46) віддадуть порожньо, і жодної помилки при цьому
ніде не буде.

---

## Розбіжності з інструкцією V2

Інструкція вимагає звіряти кожне ім'я з офіційною документацією і фіксувати
розбіжності. Знайдено чотири:

| В інструкції | Насправді | Джерело |
|--------------|-----------|---------|
| конфіг називається `powersync.yaml` | `service.yaml` (+ окремий `sync-config.yaml`), шлях задається `POWERSYNC_CONFIG_PATH` | `powersync-ja/self-host-demo` |
| `client_auth.allow_local_jwks` вмикає локальні JWKS-адреси | такого ключа більше немає; є зворотний `block_local_jwks` (типово `false`, тобто локальні адреси й так дозволені) | JSON-схема `@powersync/service-schema` |
| «bucket по `family_id`» | бакети — це legacy `bucket_definitions`; актуальні Sync Streams з `config: edition: 3`, параметр читається `auth.parameter('family_id')` | docs.powersync.com/sync/streams |
| для перевірки токенів досить `PS_JWKS_URL` | self-host Supabase лишається на HS256, JWKS порожній — потрібен ще `client_auth.supabase_jwt_secret` | розділ вище, перевірено на живому стеку |

Імена змінних середовища з контракту (`PS_DATABASE_URI`, `PS_JWKS_URL`,
`POWERSYNC_URL`, `PUBLIC_*`) збережено як є: у конфізі PowerSync вони
підставляються через `!env`, а той приймає будь-яке ім'я з префіксом `PS_`.
Додано дві змінні — `PS_STORAGE_URI` разом із вибором Postgres як сховища і
`PS_JWT_SECRET` разом із перевіркою токенів (MER-46).

---

## Секрети

Реальні значення живуть лише в `infra/.env`, який у git не потрапляє
(`.gitignore` у корені). У репозиторії — тільки `.env.example` з порожніми
секретами. У образ секрети не потрапляють теж — див. `.dockerignore`.
