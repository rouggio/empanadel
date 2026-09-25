ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "club_name" varchar(100);
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "club_phone" varchar(30);
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "club_address" varchar(200);
