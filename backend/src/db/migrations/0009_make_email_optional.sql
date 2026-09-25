ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;
-- Allow multiple NULLs in unique index (Postgres already allows, but ensure index exists as UNIQUE)
-- No change to unique constraint: nulls are distinct in Postgres, so multiple users without email are allowed
