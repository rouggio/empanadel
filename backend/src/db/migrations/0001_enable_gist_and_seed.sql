CREATE EXTENSION IF NOT EXISTS "btree_gist";--> statement-breakpoint
INSERT INTO "app_settings" ("id") VALUES (1) ON CONFLICT DO NOTHING;
