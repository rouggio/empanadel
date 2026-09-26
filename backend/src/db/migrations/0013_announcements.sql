DO $$ BEGIN
  CREATE TYPE "announcement_visibility" AS ENUM('public', 'members');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE TABLE IF NOT EXISTS "announcements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "title" varchar(200) NOT NULL,
  "body" text NOT NULL,
  "visibility" "announcement_visibility" DEFAULT 'public' NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "publish_start" date,
  "publish_end" date,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "announcement_translations" (
  "announcement_id" uuid NOT NULL REFERENCES "announcements"("id") ON DELETE CASCADE,
  "lang" varchar(5) NOT NULL,
  "title" varchar(200) NOT NULL,
  "body" text NOT NULL,
  CONSTRAINT "announcement_translations_pkey" PRIMARY KEY("announcement_id","lang")
);
