CREATE TYPE "public"."meal_type" AS ENUM('breakfast', 'lunch', 'dinner', 'snack');--> statement-breakpoint
CREATE TABLE "family" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	CONSTRAINT "family_name_not_empty" CHECK (btrim("family"."name") <> '')
);
--> statement-breakpoint
ALTER TABLE "family" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "meal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"family_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "meal_type" NOT NULL,
	"calories" integer,
	"calories_approx" boolean DEFAULT false NOT NULL,
	"protein" double precision,
	"fat" double precision,
	"carbs" double precision,
	"ingredients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"portions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "meal_name_not_empty" CHECK (btrim("meal"."name") <> ''),
	CONSTRAINT "meal_calories_non_negative" CHECK ("meal"."calories" IS NULL OR "meal"."calories" >= 0),
	CONSTRAINT "meal_macros_non_negative" CHECK (("meal"."protein" IS NULL OR "meal"."protein" >= 0)
        AND ("meal"."fat" IS NULL OR "meal"."fat" >= 0)
        AND ("meal"."carbs" IS NULL OR "meal"."carbs" >= 0)),
	CONSTRAINT "meal_ingredients_is_array" CHECK (jsonb_typeof("meal"."ingredients") = 'array'),
	CONSTRAINT "meal_portions_is_array" CHECK (jsonb_typeof("meal"."portions") = 'array')
);
--> statement-breakpoint
ALTER TABLE "meal" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pdf_import" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"family_id" uuid NOT NULL,
	"file_name" text,
	"source_text" text NOT NULL,
	CONSTRAINT "pdf_import_source_text_not_empty" CHECK (btrim("pdf_import"."source_text") <> '')
);
--> statement-breakpoint
ALTER TABLE "pdf_import" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "plan_slot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"family_id" uuid NOT NULL,
	"week_plan_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"date" date NOT NULL,
	"day_index" integer NOT NULL,
	"slot" "meal_type" NOT NULL,
	"meal_id" uuid NOT NULL,
	CONSTRAINT "plan_slot_day_index_non_negative" CHECK ("plan_slot"."day_index" >= 0)
);
--> statement-breakpoint
ALTER TABLE "plan_slot" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"family_id" uuid NOT NULL,
	"name" text NOT NULL,
	"target_calories" integer NOT NULL,
	"corridor" integer NOT NULL,
	"color" text NOT NULL,
	"shared_plan_with" uuid,
	"portion" text,
	"goal_protein" double precision,
	"goal_fat" double precision,
	"goal_carbs" double precision,
	"meal_ids" jsonb,
	CONSTRAINT "profile_name_not_empty" CHECK (btrim("profile"."name") <> ''),
	CONSTRAINT "profile_target_calories_positive" CHECK ("profile"."target_calories" > 0),
	CONSTRAINT "profile_corridor_non_negative" CHECK ("profile"."corridor" >= 0),
	CONSTRAINT "profile_color_hex" CHECK ("profile"."color" ~ '^#[0-9a-f]{6}$'),
	CONSTRAINT "profile_portion_letter" CHECK ("profile"."portion" IS NULL OR "profile"."portion" IN ('Ж', 'Ч')),
	CONSTRAINT "profile_shared_plan_not_self" CHECK ("profile"."shared_plan_with" IS DISTINCT FROM "profile"."id"),
	CONSTRAINT "profile_meal_ids_is_array" CHECK ("profile"."meal_ids" IS NULL OR jsonb_typeof("profile"."meal_ids") = 'array'),
	CONSTRAINT "profile_goals_non_negative" CHECK (("profile"."goal_protein" IS NULL OR "profile"."goal_protein" >= 0)
        AND ("profile"."goal_fat" IS NULL OR "profile"."goal_fat" >= 0)
        AND ("profile"."goal_carbs" IS NULL OR "profile"."goal_carbs" >= 0))
);
--> statement-breakpoint
ALTER TABLE "profile" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "recipe" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"family_id" uuid NOT NULL,
	"meal_id" uuid NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"prep_time" integer,
	"servings" integer,
	"photo" text,
	CONSTRAINT "recipe_steps_is_array" CHECK (jsonb_typeof("recipe"."steps") = 'array'),
	CONSTRAINT "recipe_prep_time_non_negative" CHECK ("recipe"."prep_time" IS NULL OR "recipe"."prep_time" >= 0),
	CONSTRAINT "recipe_servings_positive" CHECK ("recipe"."servings" IS NULL OR "recipe"."servings" > 0)
);
--> statement-breakpoint
ALTER TABLE "recipe" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "week_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"family_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"start_date" date NOT NULL,
	"target_calories" integer NOT NULL,
	"corridor" integer NOT NULL,
	"anti_repeat_days" integer NOT NULL,
	"days" integer NOT NULL,
	"used_corridor" integer NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "week_plan_target_calories_positive" CHECK ("week_plan"."target_calories" > 0),
	CONSTRAINT "week_plan_corridor_non_negative" CHECK ("week_plan"."corridor" >= 0),
	CONSTRAINT "week_plan_used_corridor_non_negative" CHECK ("week_plan"."used_corridor" >= 0),
	CONSTRAINT "week_plan_anti_repeat_days_non_negative" CHECK ("week_plan"."anti_repeat_days" >= 0),
	CONSTRAINT "week_plan_days_positive" CHECK ("week_plan"."days" > 0),
	CONSTRAINT "week_plan_sources_is_array" CHECK (jsonb_typeof("week_plan"."sources") = 'array'),
	CONSTRAINT "week_plan_warnings_is_array" CHECK (jsonb_typeof("week_plan"."warnings") = 'array')
);
--> statement-breakpoint
ALTER TABLE "week_plan" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "meal" ADD CONSTRAINT "meal_family_id_family_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."family"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pdf_import" ADD CONSTRAINT "pdf_import_family_id_family_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."family"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_slot" ADD CONSTRAINT "plan_slot_family_id_family_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."family"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_slot" ADD CONSTRAINT "plan_slot_week_plan_id_week_plan_id_fk" FOREIGN KEY ("week_plan_id") REFERENCES "public"."week_plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_slot" ADD CONSTRAINT "plan_slot_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_slot" ADD CONSTRAINT "plan_slot_meal_id_meal_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."meal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_family_id_family_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."family"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_shared_plan_with_profile_id_fk" FOREIGN KEY ("shared_plan_with") REFERENCES "public"."profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe" ADD CONSTRAINT "recipe_family_id_family_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."family"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe" ADD CONSTRAINT "recipe_meal_id_meal_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."meal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week_plan" ADD CONSTRAINT "week_plan_family_id_family_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."family"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "week_plan" ADD CONSTRAINT "week_plan_profile_id_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meal_family_id_idx" ON "meal" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "pdf_import_family_id_idx" ON "pdf_import" USING btree ("family_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_slot_profile_date_slot_key" ON "plan_slot" USING btree ("profile_id","date","slot") WHERE "plan_slot"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "plan_slot_family_id_idx" ON "plan_slot" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "plan_slot_week_plan_id_idx" ON "plan_slot" USING btree ("week_plan_id");--> statement-breakpoint
CREATE INDEX "profile_family_id_idx" ON "profile" USING btree ("family_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_meal_id_key" ON "recipe" USING btree ("meal_id");--> statement-breakpoint
CREATE INDEX "recipe_family_id_idx" ON "recipe" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "week_plan_family_id_idx" ON "week_plan" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "week_plan_profile_id_start_date_idx" ON "week_plan" USING btree ("profile_id","start_date");--> statement-breakpoint
CREATE POLICY "family_own_row" ON "family" AS PERMISSIVE FOR ALL TO "authenticated" USING (id = public.current_family_id()) WITH CHECK (id = public.current_family_id());--> statement-breakpoint
CREATE POLICY "meal_family" ON "meal" AS PERMISSIVE FOR ALL TO "authenticated" USING (family_id = public.current_family_id()) WITH CHECK (family_id = public.current_family_id());--> statement-breakpoint
CREATE POLICY "pdf_import_family" ON "pdf_import" AS PERMISSIVE FOR ALL TO "authenticated" USING (family_id = public.current_family_id()) WITH CHECK (family_id = public.current_family_id());--> statement-breakpoint
CREATE POLICY "plan_slot_family" ON "plan_slot" AS PERMISSIVE FOR ALL TO "authenticated" USING (family_id = public.current_family_id()) WITH CHECK (family_id = public.current_family_id());--> statement-breakpoint
CREATE POLICY "profile_family" ON "profile" AS PERMISSIVE FOR ALL TO "authenticated" USING (family_id = public.current_family_id()) WITH CHECK (family_id = public.current_family_id());--> statement-breakpoint
CREATE POLICY "recipe_family" ON "recipe" AS PERMISSIVE FOR ALL TO "authenticated" USING (family_id = public.current_family_id()) WITH CHECK (family_id = public.current_family_id());--> statement-breakpoint
CREATE POLICY "week_plan_family" ON "week_plan" AS PERMISSIVE FOR ALL TO "authenticated" USING (family_id = public.current_family_id()) WITH CHECK (family_id = public.current_family_id());