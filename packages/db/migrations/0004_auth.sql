CREATE TABLE "family_invite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"family_id" uuid NOT NULL,
	"code" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by" uuid,
	CONSTRAINT "family_invite_code_format" CHECK ("family_invite"."code" ~ '^[0-9A-F]{12}$'),
	CONSTRAINT "family_invite_accepted_together" CHECK (("family_invite"."accepted_at" IS NULL) = ("family_invite"."accepted_by" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "family_invite" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "family_member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"family_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"email" text
);
--> statement-breakpoint
ALTER TABLE "family_member" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "family_invite" ADD CONSTRAINT "family_invite_family_id_family_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."family"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_member" ADD CONSTRAINT "family_member_family_id_family_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."family"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "family_invite_code_key" ON "family_invite" USING btree ("code") WHERE "family_invite"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "family_invite_family_id_idx" ON "family_invite" USING btree ("family_id");--> statement-breakpoint
CREATE UNIQUE INDEX "family_member_user_id_key" ON "family_member" USING btree ("user_id") WHERE "family_member"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "family_member_family_id_idx" ON "family_member" USING btree ("family_id");--> statement-breakpoint
CREATE POLICY "family_invite_family" ON "family_invite" AS PERMISSIVE FOR ALL TO "authenticated" USING (family_id = public.current_family_id()) WITH CHECK (family_id = public.current_family_id());--> statement-breakpoint
CREATE POLICY "family_member_family" ON "family_member" AS PERMISSIVE FOR ALL TO "authenticated" USING (family_id = public.current_family_id()) WITH CHECK (family_id = public.current_family_id());--> statement-breakpoint

-- MER-45 · Auth: сім'я в токені.
--
-- Зверху — згенерована частина (таблиці, індекси, RLS), знизу — дописане
-- руками: чек-лист «якщо додаєте таблицю» з README плюс те, заради чого вся
-- задача, — хук, який кладе `family_id` у JWT.
--
-- Чому зовнішнього ключа на `auth.users` немає, хоч `user_id` — саме звідти:
--   1) міграції цього пакета застосовуються на чистому Postgres, і саме так їх
--      перевіряють (README) — посилання на `auth.users` це б зламало;
--   2) FK без ON DELETE заблокував би видалення користувача з боку GoTrue —
--      несподіванка в чужому сервісі;
--   3) таблиці описує Drizzle, а дописаний руками ключ став би дрейфом схеми:
--      наступний `generate` побачив би зайвий constraint і зняв його.
-- Цілісність тут тримає код: рядок членства заводять лише функції нижче, і
-- `user_id` вони беруть із JWT, а не з аргументу.

-- --- 1 · Хто зараз ходить --------------------------------------------------
-- Пара до `public.current_family_id()` з першої міграції: та сама GUC, той
-- самий спосіб читання. `sub` у JWT Supabase — це `auth.users.id`.
CREATE OR REPLACE FUNCTION public.current_user_id() RETURNS uuid
  LANGUAGE sql
  STABLE
AS $$
  SELECT NULLIF(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
    ''
  )::uuid;
$$;
--> statement-breakpoint
COMMENT ON FUNCTION public.current_user_id() IS
  'Акаунт поточного клієнта з claim sub у JWT (MER-45).';
--> statement-breakpoint

-- --- 2 · Хук доступу: family_id в токені -----------------------------------
-- Те, без чого вся схема мовчить. `public.current_family_id()` читає claim
-- `family_id`, sync-правила PowerSync (MER-46) читають його ж. Не налаштувати
-- хук — і синхронізація віддає порожньо, не сказавши ані слова.
--
-- MER-44 лишав відкритим питання, де саме житиме claim: верхнім рівнем чи в
-- `app_metadata`. Відповідь — ВЕРХНІМ РІВНЕМ. Так робить документований приклад
-- RBAC Supabase, так простіше правилам PowerSync, і `current_family_id()`
-- перевіряє його першим. Другу гілку (app_metadata) там лишаємо як була: вона
-- нічого не коштує й рятує, якщо колись знадобиться інший спосіб видачі.
--
-- Формат події та відповіді — з документації Supabase (Custom Access Token
-- Hook): на вхід `{user_id, claims, authentication_method}`, на вихід та сама
-- подія зі зміненим `claims`.
--
-- SECURITY DEFINER — свідома розбіжність із прикладом у документації, де хук
-- виконується правами `supabase_auth_admin`, а таблиця відкривається йому
-- окремим GRANT і окремою політикою. Тут таблиця — `family_member`, чий сенс
-- саме в ізоляції по сім'ї; політика «а цій ролі видно все» суперечила б їй
-- буквально. Тож функція ходить правами власника, а виконувати її може лише
-- сервер авторизації (GRANT нижче).
--
-- Немає сім'ї — немає й claim: користувач бачить рівно нічого, поки не створить
-- сім'ю або не прийме запрошення. Це не помилка, це очікуваний стан новачка.
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  claims jsonb;
  fam uuid;
BEGIN
  SELECT m.family_id INTO fam
    FROM public.family_member m
   WHERE m.user_id = (event ->> 'user_id')::uuid
     AND m.deleted_at IS NULL;

  claims := event -> 'claims';

  IF fam IS NULL THEN
    -- Не лишаємо застарілого claim: вийшов із сім'ї — доступ зник із наступним
    -- токеном, а не «колись».
    claims := claims - 'family_id';
  ELSE
    claims := jsonb_set(claims, '{family_id}', to_jsonb(fam::text));
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;
--> statement-breakpoint
COMMENT ON FUNCTION public.custom_access_token_hook(jsonb) IS
  'Custom Access Token Hook GoTrue: кладе family_id у claims (MER-45).';
--> statement-breakpoint
-- Postgres роздає EXECUTE на нові функції ролі PUBLIC — для SECURITY DEFINER це
-- обов'язково забрати першим ділом.
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
--> statement-breakpoint
-- `supabase_auth_admin` заводить сам Supabase; на чистому Postgres, на якому ці
-- міграції перевіряють, його немає — звідси перевірка.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
    GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb)
      TO supabase_auth_admin;
  END IF;
END
$$;
--> statement-breakpoint

-- --- 3 · Створення сім'ї ---------------------------------------------------
-- Курка і яйце: щоб писати в `family`, треба вже мати `family_id` у токені, а
-- щоб його мати — треба вже бути в сім'ї. Розриває це SECURITY DEFINER: функція
-- ходить правами власника таблиць, тож RLS її не стосується.
--
-- Ключова властивість безпеки — акаунт береться З ТОКЕНА (`current_user_id()`),
-- а не з аргументу. Аргументом лишається тільки назва сім'ї.
--
-- Після виклику токен клієнта ще старий, без claim. Оновити сесію — обов'язок
-- клієнта (`refreshSession()`), інакше застосунок бачитиме порожньо.
CREATE OR REPLACE FUNCTION public.create_family(family_name text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  uid uuid := public.current_user_id();
  new_family_id uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF btrim(coalesce(family_name, '')) = '' THEN
    RAISE EXCEPTION 'family_name_required' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.family_member m
     WHERE m.user_id = uid AND m.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'already_in_family' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.family (name) VALUES (btrim(family_name))
    RETURNING id INTO new_family_id;

  -- Пошта — з того самого токена. Немає її в claims (телефонний вхід тощо) —
  -- лишається NULL: підпис у списку членів вигадувати нема з чого.
  INSERT INTO public.family_member (family_id, user_id, email)
  VALUES (
    new_family_id,
    uid,
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email'
  );

  RETURN new_family_id;
END;
$$;
--> statement-breakpoint
COMMENT ON FUNCTION public.create_family(text) IS
  'Створює сім''ю й робить поточний акаунт її членом (MER-45).';
--> statement-breakpoint

-- --- 4 · Запрошення --------------------------------------------------------
-- Кодом, а не листом: self-host без SMTP пошти не надішле, а обіцяти в
-- інтерфейсі лист, якого не буде, — та сама неправда, що й вигадане значення.
--
-- 12 шістнадцяткових символів — 48 біт. Джерело — `gen_random_uuid()`, він уже
-- криптографічно стійкий і вбудований (pgcrypto тягнути не треба). Код
-- одноразовий і живе тиждень, тож перебирати його онлайн нема сенсу.
CREATE OR REPLACE FUNCTION public.create_family_invite()
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  uid uuid := public.current_user_id();
  fam uuid;
  new_code text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT m.family_id INTO fam
    FROM public.family_member m
   WHERE m.user_id = uid AND m.deleted_at IS NULL;

  IF fam IS NULL THEN
    RAISE EXCEPTION 'no_family' USING ERRCODE = '42501';
  END IF;

  LOOP
    new_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.family_invite i
       WHERE i.code = new_code AND i.deleted_at IS NULL
    );
  END LOOP;

  INSERT INTO public.family_invite (family_id, code, expires_at)
  VALUES (fam, new_code, now() + interval '7 days');

  RETURN new_code;
END;
$$;
--> statement-breakpoint
COMMENT ON FUNCTION public.create_family_invite() IS
  'Одноразовий код запрошення в сім''ю поточного акаунта, дійсний 7 днів (MER-45).';
--> statement-breakpoint

-- Приймає запрошення. Той, хто приймає, ще не має сім'ї — отже, і claim, отже,
-- і жодного рядка `family_invite` не бачить через RLS. Тому пошук коду теж
-- живе тут, під правами власника.
--
-- `FOR UPDATE` — щоб двоє, які ввели той самий код одночасно, не пройшли обидва.
CREATE OR REPLACE FUNCTION public.accept_family_invite(invite_code text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  uid uuid := public.current_user_id();
  -- UI показує код трійками через дефіс; приймаємо як завгодно набраний.
  normalized text := upper(regexp_replace(coalesce(invite_code, ''), '[^0-9A-Za-z]', '', 'g'));
  inv public.family_invite;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.family_member m
     WHERE m.user_id = uid AND m.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'already_in_family' USING ERRCODE = '23505';
  END IF;

  SELECT * INTO inv
    FROM public.family_invite i
   WHERE i.code = normalized AND i.deleted_at IS NULL
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_not_found' USING ERRCODE = '22023';
  END IF;
  IF inv.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'invite_already_used' USING ERRCODE = '22023';
  END IF;
  IF inv.expires_at <= now() THEN
    RAISE EXCEPTION 'invite_expired' USING ERRCODE = '22023';
  END IF;

  UPDATE public.family_invite
     SET accepted_at = now(), accepted_by = uid
   WHERE id = inv.id;

  INSERT INTO public.family_member (family_id, user_id, email)
  VALUES (
    inv.family_id,
    uid,
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email'
  );

  RETURN inv.family_id;
END;
$$;
--> statement-breakpoint
COMMENT ON FUNCTION public.accept_family_invite(text) IS
  'Приймає код запрошення й робить поточний акаунт членом сім''ї (MER-45).';
--> statement-breakpoint

-- Три функції вище викликає клієнт через PostgREST, тож EXECUTE потрібен
-- `authenticated`. `anon` не отримує нічого: до входу створювати нема кому.
REVOKE EXECUTE ON FUNCTION
  public.create_family(text),
  public.create_family_invite(),
  public.accept_family_invite(text)
  FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION
  public.create_family(text),
  public.create_family_invite(),
  public.accept_family_invite(text)
  TO authenticated, service_role;
--> statement-breakpoint

-- --- 5 · Чек-лист «якщо додаєте таблицю» -----------------------------------
CREATE TRIGGER family_member_touch_updated_at BEFORE UPDATE ON "family_member"
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER family_invite_touch_updated_at BEFORE UPDATE ON "family_invite"
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
--> statement-breakpoint

-- Ті самі права, що й у решти таблиць: спершу забрати все, потім видати рівно
-- потрібне. DELETE не отримує ніхто — вихід із сім'ї це `deleted_at`.
--
-- Наслідок, який варто знати: член сім'ї може правити рядки членства своєї
-- сім'ї — зокрема м'яко видалити другого. Це навмисно та сама межа довіри, що
-- й для решти даних: усередині сім'ї всі рівні. Межа, яка тут справді щось
-- тримає, інша — `WITH CHECK` не дасть вписати себе в ЧУЖУ сім'ю: у того, хто
-- сім'ї не має, `current_family_id()` порожній, і будь-який INSERT падає.
REVOKE ALL ON TABLE "family_member", "family_invite"
  FROM anon, authenticated, service_role;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "family_member", "family_invite"
  TO authenticated, service_role;
--> statement-breakpoint
GRANT SELECT ON TABLE "family_member", "family_invite" TO powersync_role;
--> statement-breakpoint

-- Публікація перелічує таблиці явно (рішення MER-43), тож нову треба додавати
-- руками — інакше вона мовчки не поїде на пристрої.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'powersync' AND schemaname = 'public' AND tablename = 'family_member'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE "family_member";
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'powersync' AND schemaname = 'public' AND tablename = 'family_invite'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE "family_invite";
  END IF;
END
$$;
--> statement-breakpoint

-- PostgREST тримає схему в кеші й нових функцій сам не помічає. Без цього
-- рядка `rpc('create_family')` відповідатиме 404, доки хтось не перезапустить
-- сервіс. На чистому Postgres NOTIFY просто нікому не слухати.
NOTIFY pgrst, 'reload schema';