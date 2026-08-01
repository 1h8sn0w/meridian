CREATE TYPE "public"."meal_pref_value" AS ENUM('favorite', 'disliked');--> statement-breakpoint
CREATE TABLE "meal_pref" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"family_id" uuid NOT NULL,
	"meal_id" uuid NOT NULL,
	"value" "meal_pref_value" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meal_pref" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "shopping_check" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"family_id" uuid NOT NULL,
	"item_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"checked" boolean DEFAULT true NOT NULL,
	CONSTRAINT "shopping_check_item_key_not_empty" CHECK (btrim("shopping_check"."item_key") <> ''),
	CONSTRAINT "shopping_check_fingerprint_not_empty" CHECK (btrim("shopping_check"."fingerprint") <> '')
);
--> statement-breakpoint
ALTER TABLE "shopping_check" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "meal_pref" ADD CONSTRAINT "meal_pref_family_id_family_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."family"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_pref" ADD CONSTRAINT "meal_pref_meal_id_meal_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."meal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_check" ADD CONSTRAINT "shopping_check_family_id_family_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."family"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "meal_pref_meal_id_key" ON "meal_pref" USING btree ("meal_id") WHERE "meal_pref"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "meal_pref_family_id_idx" ON "meal_pref" USING btree ("family_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shopping_check_item_key_key" ON "shopping_check" USING btree ("family_id","item_key","fingerprint") WHERE "shopping_check"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "shopping_check_family_id_idx" ON "shopping_check" USING btree ("family_id");--> statement-breakpoint
CREATE POLICY "meal_pref_family" ON "meal_pref" AS PERMISSIVE FOR ALL TO "authenticated" USING (family_id = public.current_family_id()) WITH CHECK (family_id = public.current_family_id());--> statement-breakpoint
CREATE POLICY "shopping_check_family" ON "shopping_check" AS PERMISSIVE FOR ALL TO "authenticated" USING (family_id = public.current_family_id()) WITH CHECK (family_id = public.current_family_id());--> statement-breakpoint

-- MER-55 · Решта чек-листа «якщо додаєте таблицю» (packages/db/README.md).
--
-- Усе, чого не описує схема Drizzle, — в цій самій міграції навмисно: таблиця
-- без тригера, прав і публікації виглядає робочою, але мовчить. Розносити це
-- по двох файлах означає дати їм розійтися.

-- --- 1 · updated_at -------------------------------------------------------
CREATE TRIGGER meal_pref_touch_updated_at BEFORE UPDATE ON "meal_pref"
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
--> statement-breakpoint
CREATE TRIGGER shopping_check_touch_updated_at BEFORE UPDATE ON "shopping_check"
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
--> statement-breakpoint

-- --- 2 · Привілеї ---------------------------------------------------------
-- Ті самі права, що й у семи таблиць MER-44: спершу забрати все (Supabase
-- роздає права на нові таблиці `public` через ALTER DEFAULT PRIVILEGES, і
-- `anon` там теж є), потім видати рівно потрібне. DELETE не отримує ніхто —
-- видалення тут це `deleted_at`.
REVOKE ALL ON TABLE "meal_pref", "shopping_check"
  FROM anon, authenticated, service_role;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "meal_pref", "shopping_check"
  TO authenticated, service_role;
--> statement-breakpoint
GRANT SELECT ON TABLE "meal_pref", "shopping_check" TO powersync_role;
--> statement-breakpoint

-- --- 3 · Реплікація -------------------------------------------------------
-- Публікація `powersync` перелічує таблиці явно (`FOR ALL TABLES` затягнув би
-- туди власні таблиці PowerSync — рішення MER-43), тож нову таблицю треба
-- додавати руками. Не додати — рядки просто не поїдуть на пристрої, і це
-- мовчазна поломка: сервер приймає записи, клієнт їх ніколи не бачить.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'powersync' AND schemaname = 'public' AND tablename = 'meal_pref'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE "meal_pref";
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'powersync' AND schemaname = 'public' AND tablename = 'shopping_check'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE "shopping_check";
  END IF;
END
$$;