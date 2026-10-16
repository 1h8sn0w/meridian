# @meridian/db — схема Supabase Postgres

Міграції серверної БД V2 (`migrations/`) — чистий SQL, який накочує `psql`.
Джерело істини між пристроями — цей Postgres; для інтерфейсу — локальний SQLite,
який наповнює PowerSync.

| Міграція | Що робить |
|----------|-----------|
| `0000_bootstrap.sql` | `current_family_id()` (основа RLS) і тригерна `touch_updated_at()` |
| `0001_schema.sql` | Сім таблиць, енум `meal_type`, індекси, RLS і політики |
| `0002_replication.sql` | Тригери `updated_at`, привілеї ролей, роль і публікація для PowerSync |
| `0003_prefs_shopping.sql` | MER-55: `meal_pref` і `shopping_check` — таблиці, тригери, права й доповнення публікації в одному файлі |
| `0004_auth.sql` | MER-45: `family_member` і `family_invite`, хук доступу GoTrue (claim `family_id`) і три RPC — створити сім'ю, зробити код, прийняти код |
| `0005_meal_gerd.sql` | MER-75: `meal.gerd` — маркер «ГЕРХ», `boolean NOT NULL DEFAULT false` |
| `0006_meal_source_issues.sql` | MER-76: `meal.source_issues` — розбіжності в джерелі, `jsonb` масив рядків, `DEFAULT '[]'` |
| `0007_starter_set.sql` | MER-77: стартовий набір — `starter.starter_set` поза API, `family.starter_seeded_at` і три RPC: `starter_set_status`, `starter_set`, `claim_starter_set` |
| `0008_powersync_drop_family_access.sql` | MER-93: `family_member` і `family_invite` виходять із публікації `powersync`, `powersync_role` втрачає `SELECT` на них — жоден стрім їх не вибирає, членство й коди запрошень лишаються лише на сервері |
| `0009_powersync_drop_family_pdf_import.sql` | MER-107: так само `family` і `pdf_import` — екрани сім'ї й імпорт працюють через PostgREST; публікація тепер дорівнює рівно синхронізованим таблицям |
| `0010_plan_slot_swapped.sql` | MER-111: `plan_slot.swapped` — слот змінено ручною заміною, `boolean NOT NULL DEFAULT false`. Ставить `replaceSlotMeal`, знімає `saveWeek`; рядки, що приїхали на пристрій до міграції, мають у SQLite `NULL` і читаються як «не замінено» |
| `0011_family_settings.sql` | MER-114: `family_settings` — налаштування сім'ї одним рядком (частковий унікальний індекс на `family_id`), поки що часові вікна сніданку, обіду й вечері в хвилинах доби. Таблиця, RLS, тригер, права й публікація — в одному файлі, як у `0003` |
| `0012_family_settings_anti_repeat.sql` | MER-116: `family_settings.anti_repeat_days` — антиповтор сім'ї, `integer` 1–7 (`family_settings_anti_repeat_days_range`); `NULL` — стандартні 3 дні з коду |

## Таблиці

| Таблиця | Що це |
|---------|-------|
| `family` | Сім'я — одиниця спільного доступу й синхронізації |
| `profile` | Профіль: ціль, коридор, порційна літера, підмножина пулу |
| `meal` | Страва з плану дієтолога |
| `recipe` | Рецептна частина страви: кроки, час, порції, фото |
| `week_plan` | Один результат генератора: параметри, коридор, джерела, попередження |
| `plan_slot` | Один прийом їжі одного дня — він же календар |
| `pdf_import` | Джерельний текст імпортованого плану (у V1 не зберігався) |
| `meal_pref` | Смак страви: «улюблене» / «не подобається» |
| `shopping_check` | Позначка «куплено» в списку покупок |
| `family_settings` | Налаштування сім'ї: часові вікна прийомів (V1 `DEFAULT_WINDOWS`), антиповтор |
| `family_member` | Акаунт GoTrue у сім'ї (MER-45) |
| `family_invite` | Одноразовий код запрошення (MER-45) |

Відповідність ключам V1 — `tools/README.md`. Службовий набір sync скрізь: `id`, `family_id`, `created_at`, `updated_at`,
`deleted_at`. RLS увімкнено скрізь.

## Рішення, які тут прийняті

**Модель V1 переїхала як є.** `source` — план дієтолога для міксу, а не
провенанс-енум; `calories_approx` — «≈» (MER-26); `portions` — дослівний текст
(MER-24). Провенанс — правило в `packages/core`, не колонка.

**Списки — `jsonb`, а не таблиці.** Інгредієнт — рядок («овочі на вибір») або
`{name, amount?, unit?}`: кількість є лише тоді, коли вона однозначна в
джерелі, а колонки `amount`/`unit` довелося б чимось заповнювати. Те саме з
`portions`, `steps`, `sources`, `warnings`, `profile.meal_ids`.

**`recipe` — окремим рядком 1:1** через важкий `photo` (як MER-35). 1:1 —
сумнівна нормалізація (рев'ю MER-44); злиття в `meal` — одна міграція.

**`plan_slot` — це і є календар.** Ключ унікальності — `(profile_id, date,
slot)`, `day_index` — довідковий номер дня в тижні. Рядок слота — одиниця
конфлікту LWW. Страва в слоті — посиланням, а не знімком: від видалення страву
береже `deleted_at`. Калорійність дня — сума слотів, окремої колонки немає.

**Смак — таблиця `meal_pref`, а не колонка страви** (MER-55): смак не з плану
дієтолога, не має ламати хеші демо-сіду (MER-37) і застигати в знімках плану.
Смаки спільні для сім'ї, як і пул.

**Відбиток — на кожному рядку `shopping_check`** (MER-55): один рядок на сім'ю
став би найгарячішою точкою LWW, а так скидання — фільтр, не руйнівний запис.
Застарілі позначки клієнт прибирає м'яко й лише відлежані (MER-62; як
рахується відбиток — `packages/core/README.md`). `checked` — прапорець, а не
наявність рядка: зняти позначку — UPDATE для LWW, а не видалення проти чужої
вставки.

**Налаштування сім'ї — таблиця `family_settings`, а не колонки `family`**
(MER-114): `family` поза публікацією (MER-107). Рядок один (частковий
унікальний індекс, виведений id `familySettingsId`). Вікна — шість `integer`
у хвилинах доби під CHECK-ами: всі `NULL` (стандартні з коду) або всі задані
(`family_settings_meal_hours_complete`). Нові налаштування — колонками в той
самий рядок і окремим PATCH (як `anti_repeat_days`, MER-116), щоб правки з
різних пристроїв не затирали одна одну.

**Калорійність — nullable:** «немає» — NULL, не нуль; «без калорій у пул не
беремо» тримає код.

**DELETE не має ніхто:** видалення — `deleted_at`, бо sync не довозить того,
чого в базі немає. Фізично — лише власник таблиць (`postgres`) руками.

**`family` без колонки `family_id`** — політика звіряє `id`.

**Сім'я клієнта — `public.current_family_id()`**, claim `family_id` верхнього
рівня JWT, а не `app_metadata` (MER-45: як приклад RBAC Supabase, простіше
PowerSync); друга гілка у функції нічого не коштує.

**Claim кладе хук доступу GoTrue** (`public.custom_access_token_hook`,
MER-45) з `family_member` — при вході й при оновленні. Немає членства — немає
claim, і клієнт не бачить нічого: це нормальний стан нового акаунта. Хук
вмикає compose (`infra/DECISIONS.md`).

**Хук — `SECURITY DEFINER`, свідомо не як у документації.** Там він ходить
правами `supabase_auth_admin` з окремою політикою «цій ролі видно все»; для
`family_member` це суперечило б ізоляції по сім'ї. Тому функція ходить
правами власника, а EXECUTE має лише сервер авторизації.

**Членство змінюють лише функції** (`create_family`, `create_family_invite`,
`accept_family_invite`, `SECURITY DEFINER`): у акаунта без сім'ї немає claim. Акаунт вони беруть **із токена**
(`public.current_user_id()`), не з аргументу. Член сім'ї може правити рядки
членства своєї сім'ї (усередині сім'ї всі рівні); `WITH CHECK` не дасть
вписати себе в чужу.

**Один акаунт — одна сім'я:** у JWT один `family_id`, інакше RLS
недетермінована.

**Запрошення кодом, а не листом** (без SMTP листа не буде): 12 hex (48 біт) із
`gen_random_uuid()`, одноразовий, живе тиждень.

**FK на `auth.users` немає:** міграції мають ставати на чистий Postgres, а FK
без `ON DELETE` блокував би видалення користувача з боку GoTrue.

## Що лишається на пристрої

Рішення MER-55 по ключах V1 (з ним звіряється MER-48): смаки
(`meridian.mealPrefs.v1`) і позначки «куплено» (`meridian.shopping.v1` →
`checked`, `fingerprint`) — на сервер (`meal_pref`, `shopping_check`).
Охоплення списку (`scope`), налаштування нагадувань (`meridian.app.v1` →
`reminders`), позначки надісланих (`remindersFired`) і активний профіль
(`meridian.profiles.v1` → `activeId`) — на пристрої.

Нагадування шле сама сторінка (MER-20): синхронізовані `remindersFired`
погасили б нагадування іншої людини, а `enabled` прив'язане до дозволу
браузера на пристрої. Охоплення й активний профіль — фільтри показу.

## Застосувати міграції

Міграції накочує сам стек — одноразовий сервіс `migrate` (`compose.yaml`), і
все, що працює з даними, чекає на нього. Після зміни: `docker compose up
migrate`. Рядок підключення він збирає сам і йде в `db:5432`. Руками —
`pnpm db:migrate` (той самий скрипт із хоста: `DATABASE_URL` у середовищі,
`psql` у `PATH`).

**Нова міграція — новий файл** `migrations/NNNN_назва.sql` з наступним
номером, SQL руками (рушія схеми немає з MER-69). `--> statement-breakpoint` у
старих файлах — залишок drizzle, у нових не потрібен.

### Як це накочується

`migrate.sh` — `psql` плюс журнал застосованого; запуск `DATABASE_URL=… sh
migrate.sh`, без змінної — помилка з прикладом рядка.

- **Журнал — `migrations.applied`** у власній схемі: усе в `public` PostgREST
  віддає в API.
- **Один файл — одна транзакція** (`--single-transaction`, `ON_ERROR_STOP=1`),
  рядок у журнал — тією самою транзакцією. Невдала міграція не лишає ні
  напівзміненої бази, ні брехливого запису, а сервіс виходить із ненульовим
  кодом.
- **Порядок — за іменем файлу**, номер на початку обов'язковий.
- **Ім'я файлу підставляється в SQL рядком, а не через `-v`:** змінні psql
  розгортає лише в тому, що читає сам (`-f`, stdin), а `-c` іде на сервер як
  є.
- **Успадкований журнал drizzle** переноситься один раз: скільки рядків у
  `drizzle.__drizzle_migrations`, стільки перших файлів позначається
  застосованими, далі схема `drizzle` зникає. Без цього `0000` і `0002`
  накотилися б удруге (`CREATE TRIGGER` на наявних тригерах — стек не
  підніметься). Блок прибрати, коли не лишиться баз до MER-69.

### Стартовий набір у `migrate.sh`

Шлях усередині контейнера — `STARTER_SET_PATH` (задає `compose.yaml`; на
хості — `STARTER_SET_FILE`, `infra/README.md`). Змінна не задана (ручний
`pnpm db:migrate`) — набору не торкаємось; файл непорожній — вміст іде в
`starter.starter_set`; порожній (`/dev/null`) — набір видаляється. Вміст читає
сам psql (`\set` зі зворотними лапками у heredoc): аргумент командного рядка в
Linux обмежено 128 КБ. Зіпсований JSON стек не зупиняє — попередження в
журналі, попередній набір лишається; повна перевірка — `pnpm starter:check`.
Фізичний `DELETE` тут свідомий: таблиця службова, поза синхронізацією, пише в
неї лише цей скрипт.

## Перевірити без Supabase

Міграції не залежать від схеми `auth` і ставляться на чистий Postgres;
ролі Supabase — заглушками:

```bash
docker run -d --name mer-pg -e POSTGRES_PASSWORD=postgres -p 55432:5432 postgres:17-alpine -c wal_level=logical
docker exec mer-pg psql -U postgres -c "create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; create role supabase_auth_admin noinherit login password 'x';"
DATABASE_URL=postgresql://postgres:postgres@localhost:55432/postgres pnpm db:migrate
```

Без `supabase_auth_admin` GRANT на хук пропускається. RLS:
`SET ROLE authenticated`, `select set_config('request.jwt.claims',
'{"family_id":"…"}', false)` — видно рівно рядки своєї сім'ї. Функції MER-45 —
claims із `sub`, `public.create_family(…)`, потім
`public.custom_access_token_hook(...)` із синтетичною подією: `family_id` у
`claims`. На справжньому GoTrue (`supabase/gotrue`, схема `auth` заздалегідь,
`search_path = auth`): два акаунти через `create_family` /
`accept_family_invite` — в обох токенах один `family_id`.

## Якщо додаєте таблицю

Чотири речі в одній міграції:

1. службовий набір sync і `ENABLE ROW LEVEL SECURITY`;
2. політику по `family_id` — без неї таблиця мовчить;
3. тригер `touch_updated_at` і GRANT `SELECT, INSERT, UPDATE` (без DELETE);
4. **таблицю в публікацію `powersync`** (перелічує таблиці явно,
   `infra/DECISIONS.md`) і `GRANT SELECT` для `powersync_role`; поза міграцією —
   стрім у `sync-config.yaml`, таблицю в `AppSchema` і `jsonb`/`boolean`-колонки
   в `JSON_COLUMNS`/`BOOLEAN_COLUMNS`. Таблиця, якій на пристрої нема чого
   робити, — у винятки `sync-contract.test.ts`. Забуте місце — червоний тест.

Приклад усіх чотирьох — `0003_prefs_shopping.sql` (MER-55). Застосовані
`0000–0007` заморожені як історія й мають коментарі (виняток у
`tools/check-comments.mjs`); нові міграції — без коментарів, пояснення —
рядком у таблиці вгорі.
