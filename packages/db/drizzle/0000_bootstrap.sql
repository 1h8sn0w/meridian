-- MER-44 · Підготовка: функції, на яких тримається вся схема.
--
-- Політики семи таблиць звіряють `family_id` рядка з сім'єю клієнта. Сім'я
-- приходить у JWT — claim `family_id` (його налаштовує MER-45). Тримаємо це
-- в одній функції навмисно: коли MER-45 остаточно вибере, де саме сидить
-- claim, правити доведеться один рядок, а не політики на семи таблицях.
--
-- Читаємо GUC `request.jwt.claims` — ту саму, з якої бере claims `auth.jwt()`
-- у Supabase. Напряму, а не через `auth.jwt()`, щоб схема не залежала від
-- схеми `auth`: так ці ж міграції застосовуються й на чистому Postgres, на
-- якому їх можна перевірити без усього стека Supabase.
--
-- `STABLE` — у межах запиту значення не змінюється, тож планувальник викличе
-- функцію раз, а не на кожен рядок.

CREATE OR REPLACE FUNCTION public.current_family_id() RETURNS uuid
  LANGUAGE sql
  STABLE
AS $$
  SELECT NULLIF(
    COALESCE(
      -- claim верхнього рівня (custom access token hook)
      NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'family_id',
      -- або всередині app_metadata — залежно від того, як його видасть MER-45
      NULLIF(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'family_id'
    ),
    ''
  )::uuid;
$$;
--> statement-breakpoint
COMMENT ON FUNCTION public.current_family_id() IS
  'Сім''я поточного клієнта з claim family_id у JWT. Основа RLS усіх таблиць (MER-44).';
--> statement-breakpoint

-- `updated_at` мусить бути правдивим: на ньому тримається діагностика
-- синхронізації й уся розмова про «останню зміну». Тригер, а не клієнт — щоб
-- значення не залежало ні від годинника пристрою, ні від того, чи не забув
-- його виставити той, хто пише.
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
COMMENT ON FUNCTION public.touch_updated_at() IS
  'Тригерна функція: оновлює updated_at на кожен UPDATE (MER-44).';
