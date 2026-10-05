-- MER-77 · Стартовий набір страв.
--
-- Набір — страви з планів дієтолога, якими засівається пул нової сім'ї. Плани
-- персональні, а репозиторій публічний, тому файл набору живе на сервері
-- self-host ПОЗА репозиторієм: його монтують у сервіс `migrate`, і `migrate.sh`
-- кладе вміст у таблицю нижче (infra/README.md). Немає файлу — немає рядка, і
-- застосунок працює як без набору.
--
-- Засіває пул сам клієнт, звичайними записами в локальну базу: валідація
-- формату — у `packages/core` (`parseStarterSet`), id страв виведені з ключа
-- набору (`starterMealId`), тож повтор і другий пристрій не дублюють страв.
-- Сервер відповідає лише за дві речі: віддати набір тільки своїм і пам'ятати,
-- що сім'ю вже засіяно.

-- --- 1 · Сам набір ----------------------------------------------------------
-- Окрема схема, а не `public`: PostgREST віддає в API все, що лежить у
-- `public` (db-schemas = "public"), а набір має діставатися лише через функції
-- нижче — і лише автентифікованому члену сім'ї. Через Caddy публічно його не
-- видно ніяк: статичних файлів набору немає, а `/rest/v1` без токена сім'ї
-- функцію не виконає.
--
-- Рядок один на весь self-host (`id` — завжди true). Перевірка форми тут
-- мінімальна (є масив `meals`) — повна живе в ядрі, одна на клієнт і на
-- `pnpm starter:check`.
CREATE SCHEMA IF NOT EXISTS starter;
REVOKE ALL ON SCHEMA starter FROM PUBLIC;

CREATE TABLE starter.starter_set (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  data jsonb NOT NULL CHECK (jsonb_typeof(data -> 'meals') = 'array'),
  loaded_at timestamptz NOT NULL DEFAULT now()
);

-- --- 2 · «Сім'ю вже засіяно» -----------------------------------------------
-- Засів — один раз на сім'ю, а не при кожному відкритті: очистила сім'я пул —
-- страви самі не повертаються, лише кнопкою «Додати стартовий набір». Позначка
-- живе на `family`, бо це факт про сім'ю, а не про пристрій; `family` поза
-- синхронізацією, тож і позначку читають лише функції нижче.
--
-- NULL у сімей, створених до цієї міграції, — і це навмисно: щойно на сервері
-- з'явиться набір, наявна сім'я отримає його з наступним відкриттям так само,
-- як нова.
ALTER TABLE public.family ADD COLUMN starter_seeded_at timestamptz;

-- --- 3 · Функції -----------------------------------------------------------
-- SECURITY DEFINER — бо таблиця набору клієнтам закрита повністю. Сім'ю
-- функції беруть із токена (`current_family_id()`), а не з аргументу.

-- Стан для інтерфейсу: 'none' — набору на сервері немає, 'pending' — є, а сім'ю
-- ще не засіяно, 'seeded' — засіяно. Дешевий виклик на кожне відкриття: сам
-- набір (десятки кілобайт) тягнеться лише тоді, коли він справді потрібен.
CREATE OR REPLACE FUNCTION public.starter_set_status()
  RETURNS text
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  fam uuid := public.current_family_id();
BEGIN
  IF fam IS NULL THEN
    RAISE EXCEPTION 'no_family' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM starter.starter_set) THEN
    RETURN 'none';
  END IF;
  RETURN CASE
    WHEN (SELECT f.starter_seeded_at FROM public.family f WHERE f.id = fam) IS NULL
      THEN 'pending'
    ELSE 'seeded'
  END;
END;
$$;

-- Сам набір (або NULL, якщо його немає). Позначку не ставить: клієнт спершу
-- перевіряє формат і лише потім забирає засів собі (`claim_starter_set`), щоб
-- зіпсований файл не «спалив» засів — після виправлення файлу сім'я отримає
-- набір із наступним відкриттям.
CREATE OR REPLACE FUNCTION public.starter_set()
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.current_family_id() IS NULL THEN
    RAISE EXCEPTION 'no_family' USING ERRCODE = '42501';
  END IF;
  RETURN (SELECT s.data FROM starter.starter_set s);
END;
$$;

-- Позначити сім'ю засіяною. true — позначив САМЕ цей виклик: два пристрої, що
-- відкрилися одночасно, упираються в блокування рядка `family`, і другий уже
-- бачить позначку. Автозасів пише страви лише після true; кнопка «Додати
-- стартовий набір» кличе функцію теж, але засіває незалежно від відповіді.
CREATE OR REPLACE FUNCTION public.claim_starter_set()
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  fam uuid := public.current_family_id();
BEGIN
  IF fam IS NULL THEN
    RAISE EXCEPTION 'no_family' USING ERRCODE = '42501';
  END IF;
  UPDATE public.family SET starter_seeded_at = now()
   WHERE id = fam AND starter_seeded_at IS NULL;
  RETURN FOUND;
END;
$$;

-- Postgres роздає EXECUTE на нові функції ролі PUBLIC — для SECURITY DEFINER це
-- забирається першим ділом. `anon` не отримує нічого: без входу набору немає.
REVOKE EXECUTE ON FUNCTION public.starter_set_status() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.starter_set() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_starter_set() FROM PUBLIC;
DO $$
BEGIN
  -- Ролі Supabase; на чистому Postgres (перевірка міграцій, README) їх може не
  -- бути — тоді й видавати нікому.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE EXECUTE ON FUNCTION public.starter_set_status() FROM anon;
    REVOKE EXECUTE ON FUNCTION public.starter_set() FROM anon;
    REVOKE EXECUTE ON FUNCTION public.claim_starter_set() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.starter_set_status() TO authenticated;
    GRANT EXECUTE ON FUNCTION public.starter_set() TO authenticated;
    GRANT EXECUTE ON FUNCTION public.claim_starter_set() TO authenticated;
  END IF;
END
$$;
