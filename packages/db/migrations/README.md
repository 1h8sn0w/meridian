# migrations — SQL-міграції Postgres

Файли накочує `../migrate.sh` за іменем, по одній транзакції на файл
(`../README.md`, «Як це накочується»).

**Нова міграція — новий файл** `NNNN_назва.sql` з наступним номером, SQL
руками (рушія схеми немає з MER-69). `--> statement-breakpoint` у старих
файлах — залишок drizzle, у нових не потрібен. Застосовані `0000–0007`
заморожені разом із коментарями (`AGENTS.md`); нові — без них, пояснення —
рядком у таблиці нижче. Нова таблиця — чек-лист «Якщо додаєте таблицю» в
`../README.md`.

| Міграція | Що робить |
|----------|-----------|
| `0000_bootstrap.sql` | `current_family_id()` (основа RLS) і тригерна `touch_updated_at()` |
| `0001_schema.sql` | Сім таблиць, енум `meal_type`, індекси, RLS і політики |
| `0002_replication.sql` | Тригери `updated_at`, привілеї ролей, роль і публікація для PowerSync |
| `0003_prefs_shopping.sql` | MER-55: `meal_pref` і `shopping_check` з тригерами, правами й публікацією |
| `0004_auth.sql` | MER-45: `family_member` і `family_invite`, хук доступу GoTrue (claim `family_id`) і три RPC — створити сім'ю, зробити код, прийняти код |
| `0005_meal_gerd.sql` | MER-75: `meal.gerd` — маркер «ГЕРХ», `boolean NOT NULL DEFAULT false` |
| `0006_meal_source_issues.sql` | MER-76: `meal.source_issues` — розбіжності в джерелі, `jsonb` масив рядків, `DEFAULT '[]'` |
| `0007_starter_set.sql` | MER-77: стартовий набір — `starter.starter_set` поза API, `family.starter_seeded_at` і три RPC: `starter_set_status`, `starter_set`, `claim_starter_set` |
| `0008_powersync_drop_family_access.sql` | MER-93: `family_member` і `family_invite` поза публікацією `powersync` і без `SELECT` для `powersync_role` — жоден стрім їх не вибирає |
| `0009_powersync_drop_family_pdf_import.sql` | MER-107: так само `family` і `pdf_import` (вони йдуть через PostgREST); публікація = рівно синхронізовані таблиці |
| `0010_plan_slot_swapped.sql` | MER-111: `plan_slot.swapped` — слот змінено ручною заміною, `boolean NOT NULL DEFAULT false`; `NULL` у SQLite — «не замінено» |
| `0011_family_settings.sql` | MER-114: `family_settings` — налаштування сім'ї одним рядком, вікна сніданку, обіду й вечері |
| `0012_family_settings_anti_repeat.sql` | MER-116: `family_settings.anti_repeat_days` — антиповтор сім'ї, `integer` 1–7 (`family_settings_anti_repeat_days_range`); `NULL` — стандартні 3 дні з коду |
| `0013_meal_portion_w.sql` | MER-79: `meal.calories_w`, `protein_w`, `fat_w`, `carbs_w` — цифри порції Ж; наявні `calories` і БЖВ — порція Ч. `NULL` — немає в джерелі, межі ті самі (`>= 0`) |
| `0014_profile_with_snack.sql` | MER-78: `profile.with_snack` — чи є в днях профілю перекус, `boolean NOT NULL DEFAULT true` |
| `0015_meal_macros_approx.sql` | MER-141: `meal.macros_approx` — «≈» на БЖВ, `boolean NOT NULL DEFAULT false` |
| `0016_shopping_extra.sql` | MER-154: `shopping_extra` — свої пункти списку покупок, без відбитка плану |
