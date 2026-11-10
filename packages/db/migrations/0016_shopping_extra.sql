CREATE TABLE "shopping_extra" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"family_id" uuid NOT NULL REFERENCES "family"("id"),
	"name" text NOT NULL,
	"checked" boolean DEFAULT false NOT NULL,
	CONSTRAINT "shopping_extra_name_not_empty" CHECK (btrim("name") <> '')
);

ALTER TABLE "shopping_extra" ENABLE ROW LEVEL SECURITY;

CREATE INDEX "shopping_extra_family_id_idx" ON "shopping_extra" USING btree ("family_id");

CREATE POLICY "shopping_extra_family" ON "shopping_extra" AS PERMISSIVE FOR ALL TO "authenticated" USING (family_id = public.current_family_id()) WITH CHECK (family_id = public.current_family_id());

CREATE TRIGGER shopping_extra_touch_updated_at BEFORE UPDATE ON "shopping_extra"
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

REVOKE ALL ON TABLE "shopping_extra" FROM anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE ON TABLE "shopping_extra" TO authenticated, service_role;

GRANT SELECT ON TABLE "shopping_extra" TO powersync_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'powersync' AND schemaname = 'public' AND tablename = 'shopping_extra'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE "shopping_extra";
  END IF;
END
$$;
