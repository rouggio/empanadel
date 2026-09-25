ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "telegram_chat_id" varchar(100);
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "notifications_enabled" boolean DEFAULT false NOT NULL;
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "telegram_bot_token" text;
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "telegram_admin_chat_id" varchar(255);
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "whatsapp_token" text;
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "whatsapp_phone_number_id" varchar(50);
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "whatsapp_admin_phone" varchar(30);
