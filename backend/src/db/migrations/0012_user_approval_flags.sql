ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "notify_on_approval" boolean DEFAULT true NOT NULL;
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "notify_on_rejection" boolean DEFAULT true NOT NULL;
