# infra — self-host

Інфраструктура V2: наш Docker Compose, Caddyfile, конфіг PowerSync і приклад
`.env`. Supabase сюди **не** копіюється — він піднімається окремо власним
офіційним compose.

| Файл | Призначення |
|------|-------------|
| `docker-compose.yml` | Рівно три сервіси: `web`, `powersync`, `caddy`. Підключаються до мережі Supabase як до зовнішньої |
| `web.Dockerfile` | Прод-образ `apps/web`. Контекст збірки — корінь репозиторію (pnpm-воркспейс) |
| `caddy/Caddyfile` | Два хости — застосунок і sync-ендпоінт. HTTPS Caddy бере сам |
| `powersync/service.yaml` | Конфіг PowerSync Service, монтується лише для читання |
| `powersync/sync-config.yaml` | Правила синхронізації. Поки порожні — MER-46 |
| `supabase/docker-compose.override.yml` | Накладка на compose **Supabase**: вмикає хук доступу (MER-45). Копіюється туди, не запускається звідси |
| `.env.example` | Контракт змінних; секретні значення порожні |

---

## Запуск

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

Локально ще варто ввімкнути `ENABLE_EMAIL_AUTOCONFIRM=true` у `.env` Supabase:
SMTP у типовому self-host не налаштований, тож лист із підтвердженням нікуди не
піде й акаунт лишиться неактивованим.

Запуск:

```bash
cd supabase-project && docker compose up -d
```

Каталог `supabase-project/` у наш репозиторій не комітиться — це чужий код зі
своїм життєвим циклом. Тримати його поруч із репозиторієм або в іншому місці.

Після старту: Studio і REST — на `http://localhost:8000`, Postgres через пулер
supavisor — на `localhost:5432`.

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
розбіжності. Знайдено дві:

| В інструкції | Насправді | Джерело |
|--------------|-----------|---------|
| конфіг називається `powersync.yaml` | `service.yaml` (+ окремий `sync-config.yaml`), шлях задається `POWERSYNC_CONFIG_PATH` | `powersync-ja/self-host-demo` |
| `client_auth.allow_local_jwks` вмикає локальні JWKS-адреси | такого ключа більше немає; є зворотний `block_local_jwks` (типово `false`, тобто локальні адреси й так дозволені) | JSON-схема `@powersync/service-schema` |

Імена змінних середовища з контракту (`PS_DATABASE_URI`, `PS_JWKS_URL`,
`POWERSYNC_URL`, `PUBLIC_*`) збережено як є: у конфізі PowerSync вони
підставляються через `!env`, а той приймає будь-яке ім'я з префіксом `PS_`.
Додано одну змінну — `PS_STORAGE_URI` — разом із вибором Postgres як сховища.

---

## Секрети

Реальні значення живуть лише в `infra/.env`, який у git не потрапляє
(`.gitignore` у корені). У репозиторії — тільки `.env.example` з порожніми
секретами. У образ секрети не потрапляють теж — див. `.dockerignore`.
