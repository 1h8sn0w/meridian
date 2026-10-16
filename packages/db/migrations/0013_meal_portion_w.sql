ALTER TABLE "meal" ADD COLUMN "calories_w" integer CONSTRAINT "meal_calories_w_non_negative" CHECK ("calories_w" IS NULL OR "calories_w" >= 0);
ALTER TABLE "meal" ADD COLUMN "protein_w" double precision;
ALTER TABLE "meal" ADD COLUMN "fat_w" double precision;
ALTER TABLE "meal" ADD COLUMN "carbs_w" double precision;
ALTER TABLE "meal" ADD CONSTRAINT "meal_macros_w_non_negative" CHECK (("protein_w" IS NULL OR "protein_w" >= 0)
        AND ("fat_w" IS NULL OR "fat_w" >= 0)
        AND ("carbs_w" IS NULL OR "carbs_w" >= 0));
