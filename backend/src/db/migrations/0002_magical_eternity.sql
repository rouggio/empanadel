CREATE TYPE "public"."preferred_language" AS ENUM('it', 'en', 'fr', 'de', 'es');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "preferred_language" "preferred_language" DEFAULT 'it' NOT NULL;