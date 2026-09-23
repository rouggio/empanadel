import { createDb } from "../db/connection.js";
import { bookings } from "../db/schema.js";
import { lt, eq, and } from "drizzle-orm";

async function run() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  const { db, pool } = createDb(url);
  const now = new Date();
  const result = await db
    .update(bookings)
    .set({ status: "expired", updatedAt: now })
    .where(and(eq(bookings.status, "pending_registration"), lt(bookings.expiresAt, now)));
  console.log(`Expired holds: ${JSON.stringify(result)} at ${now.toISOString()}`);
  await pool.end();
}

import path from "path";
import { fileURLToPath } from "url";
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain || process.argv[1]?.endsWith("expireHolds.ts") || process.argv[1]?.endsWith("expireHolds.js")) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

export { run as expireHolds };
