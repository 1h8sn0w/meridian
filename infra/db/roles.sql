-- Паролі службових ролей Postgres — одноразово, під час ініціалізації бази.
--
-- Самі ролі (`anon`, `authenticated`, `service_role`, `authenticator`,
-- `supabase_auth_admin`) заводить образ supabase/postgres: вони частина його
-- початкової схеми, і саме на них посилаються політики RLS у міграціях
-- packages/db. Тут лише видається пароль тим двом, які реально входять у базу
-- по мережі:
--
--   authenticator       — під ним підключається PostgREST і далі перемикається
--                         на anon/authenticated залежно від claim `role`;
--   supabase_auth_admin — під ним працює GoTrue у схемі auth.
--
-- Решті (pgbouncer, supabase_storage_admin, supabase_functions_admin) пароля
-- не даємо свідомо: сервісів, які ними ходять, у цьому стеку немає, а роль без
-- пароля не може ввійти.
--
-- Форма запозичена з volumes/db/roles.sql офіційного compose Supabase: пароль
-- береться зі змінної середовища через `\set`, щоб не лежати у файлі.
-- POSTGRES_PASSWORD сюди приносить оболонка сервісу `db` — вона читає його з
-- того самого спільного тому, куди його згенерував `init`.

\set pgpass `echo "$POSTGRES_PASSWORD"`

ALTER USER authenticator WITH PASSWORD :'pgpass';
ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';
