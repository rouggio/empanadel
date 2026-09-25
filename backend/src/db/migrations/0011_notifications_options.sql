ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "notify_on_auto_approved" boolean DEFAULT false NOT NULL;
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "notify_via_telegram" boolean DEFAULT true NOT NULL;
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "notify_via_whatsapp" boolean DEFAULT true NOT NULL;
