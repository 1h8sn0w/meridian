CREATE TABLE "family_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"family_id" uuid NOT NULL REFERENCES "family"("id"),
	"breakfast_start" integer,
	"breakfast_end" integer,
	"lunch_start" integer,
	"lunch_end" integer,
	"dinner_start" integer,
	"dinner_end" integer,
	CONSTRAINT "family_settings_meal_hours_complete" CHECK (num_nulls("breakfast_start", "breakfast_end", "lunch_start", "lunch_end", "dinner_start", "dinner_end") IN (0, 6)),
	CONSTRAINT "family_settings_meal_hours_order" CHECK (0 <= "breakfast_start" AND "breakfast_start" < "breakfast_end" AND "breakfast_end" <= "lunch_start" AND "lunch_start" < "lunch_end" AND "lunch_end" <= "dinner_start" AND "dinner_start" < "dinner_end" AND "dinner_end" <= 1440)
);

ALTER TABLE "family_settings" ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX "family_settings_family_id_key" ON "family_settings" USING btree ("family_id") WHERE "deleted_at" IS NULL;

CREATE POLICY "family_settings_family" ON "family_settings" AS PERMISSIVE FOR ALL TO "authenticated" USING (family_id = public.current_family_id()) WITH CHECK (family_id = public.current_family_id());

CREATE TRIGGER family_settings_touch_updated_at BEFORE UPDATE ON "family_settings"
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

REVOKE ALL ON TABLE "family_settings" FROM anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE ON TABLE "family_settings" TO authenticated, service_role;

GRANT SELECT ON TABLE "family_settings" TO powersync_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'powersync' AND schemaname = 'public' AND tablename = 'family_settings'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE "family_settings";
  END IF;
END
$$;
