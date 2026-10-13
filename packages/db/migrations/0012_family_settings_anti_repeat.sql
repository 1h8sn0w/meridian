ALTER TABLE "family_settings" ADD COLUMN "anti_repeat_days" integer CONSTRAINT "family_settings_anti_repeat_days_range" CHECK ("anti_repeat_days" BETWEEN 1 AND 7);
