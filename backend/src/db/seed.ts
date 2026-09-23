import "dotenv/config";
import { createDb } from "./connection.js";
import { courts, timetables, users, appSettings } from "./schema.js";
import * as argon2 from "argon2";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const { db, pool } = createDb(url);

// Ensure app_settings row
await db.insert(appSettings).values({ id: 1 }).onConflictDoNothing();

// Seed courts 1-4
const seedCourts = [
  { number: 1, type: "tennis" as const, name: "Central Tennis", surface: "clay" },
  { number: 2, type: "tennis" as const, name: "Tennis 2", surface: "synthetic" },
  { number: 3, type: "padel" as const, name: "Padel 1", surface: "synthetic" },
  { number: 4, type: "padel" as const, name: "Padel 2", surface: "synthetic" },
];

for (const c of seedCourts) {
  await db.insert(courts).values(c).onConflictDoNothing();
}

// Default timetable: 08:00-22:00, padel 90 min, tennis 60 min
const allCourts = await db.select().from(courts);
for (const court of allCourts) {
  const slot = court.type === "padel" ? 90 : 60;
  for (let dow = 0; dow <= 6; dow++) {
    await db
      .insert(timetables)
      .values({
        courtId: court.id,
        dayOfWeek: dow,
        openTime: "08:00",
        closeTime: "22:00",
        slotDurationMinutes: slot,
        isClosed: false,
      })
      .onConflictDoNothing();
  }
}

// Admin user (admin / admin123!)
const adminHash = await argon2.hash("admin123!");
await db
  .insert(users)
  .values({
    username: "admin",
    email: "admin@empanadel.local",
    passwordHash: adminHash,
    firstName: "Admin",
    lastName: "Empanadel",
    role: "admin",
    isVerified: true,
  })
  .onConflictDoNothing();

console.log("Seed complete");
await pool.end();
