ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "public_url" varchar(255);
UPDATE "app_settings" SET "public_url" = 'https://empanadel.onrender.com' WHERE "id" = 1 AND "public_url" IS NULL;
