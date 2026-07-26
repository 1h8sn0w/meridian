-- MER-44 · Права, тригери й реплікація.
--
-- Три речі, яких не вміє описати схема Drizzle:
--   1) тригери `updated_at`;
--   2) привілеї ролей Supabase — зокрема відсутність DELETE;
--   3) роль і публікація для логічної реплікації PowerSync.

-- --- 1 · updated_at -------------------------------------------------------
CREATE TRIGGER family_touch_updated_at BEFORE UPDATE ON "family"
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER profile_touch_updated_at BEFORE UPDATE ON "profile"
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER meal_touch_updated_at BEFORE UPDATE ON "meal"
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER recipe_touch_updated_at BEFORE UPDATE ON "recipe"
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER week_plan_touch_updated_at BEFORE UPDATE ON "week_plan"
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER plan_slot_touch_updated_at BEFORE UPDATE ON "plan_slot"
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER pdf_import_touch_updated_at BEFORE UPDATE ON "pdf_import"
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
--> statement-breakpoint

-- --- 2 · Привілеї ---------------------------------------------------------
-- Supabase роздає права на нові таблиці `public` через ALTER DEFAULT
-- PRIVILEGES — і `anon` там теж є. Покладатися на це не варто: спершу
-- забираємо все, потім видаємо рівно потрібне.
--
-- DELETE не отримує НІХТО. Видалення в цій схемі — це `deleted_at`: sync-рушій
-- не вміє довозити те, чого в базі вже немає. Фізично видалити рядок може лише
-- власник таблиць (`postgres`), і це має лишатися свідомою ручною дією.
REVOKE ALL ON TABLE
  "family", "profile", "meal", "recipe", "week_plan", "plan_slot", "pdf_import"
  FROM anon, authenticated, service_role;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE
  "family", "profile", "meal", "recipe", "week_plan", "plan_slot", "pdf_import"
  TO authenticated, service_role;
--> statement-breakpoint
-- `anon` не отримує нічого: до входу в застосунку дивитися нема на що.
-- Політик для нього теж немає, тож навіть із правами він побачив би нуль
-- рядків — це друга лінія, а не єдина.

-- --- 3 · Реплікація PowerSync ---------------------------------------------
-- Виділена роль замість суперкористувача `postgres` (рішення MER-43, віднесене
-- сюди, бо SQL у цьому проєкті живе в міграціях). Їй потрібні рівно три речі:
-- REPLICATION — щоб створити слот, BYPASSRLS — щоб знімок початкової
-- синхронізації не обрізали політики, і SELECT на семи таблицях.
--
-- Пароль тут не задається свідомо: секрети в git не потрапляють. Поки пароль
-- не встановлено, роль не може ввійти — реплікація й далі працює під
-- `postgres`. Як перемкнути — в `infra/README.md`.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'powersync_role') THEN
    CREATE ROLE powersync_role WITH LOGIN REPLICATION BYPASSRLS;
  END IF;
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO powersync_role;
--> statement-breakpoint
GRANT SELECT ON TABLE
  "family", "profile", "meal", "recipe", "week_plan", "plan_slot", "pdf_import"
  TO powersync_role;
--> statement-breakpoint

-- Публікація для PowerSync. Ім'я `powersync` — типове для сервісу.
--
-- ТІЛЬКИ наші сім таблиць. `FOR ALL TABLES` тут — зациклення: сховище бакетів
-- PowerSync живе в цій самій базі (рішення MER-43), тож публікація затягнула б
-- у реплікацію його власні таблиці. Нову таблицю треба буде додавати сюди
-- явно — це навмисна незручність.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'powersync') THEN
    CREATE PUBLICATION powersync FOR TABLE
      "family", "profile", "meal", "recipe", "week_plan", "plan_slot", "pdf_import";
  END IF;
END
$$;
