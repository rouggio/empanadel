import type { FastifyInstance } from "fastify";
import { timetableBulkSchema } from "../types/schemas.js";
import { timetables } from "../db/schema.js";
import { eq, and, asc } from "drizzle-orm";

export default async function timetableRoutes(fastify: FastifyInstance) {
  fastify.get("/api/timetable", async (req, reply) => {
    const db: any = (fastify as any).db;
    if (!db) return reply.send([]);
    const { court_id } = (req.query as any) || {};
    const rows = await db.select().from(timetables).orderBy(asc(timetables.dayOfWeek));
    const filtered = court_id ? rows.filter((r: any) => String(r.courtId) === String(court_id) || r.courtId === null) : rows;
    return reply.send(filtered);
  });

  fastify.put("/api/timetable", { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] }, async (req, reply) => {
    const parsed = timetableBulkSchema.safeParse((req as any).body);
    if (!parsed.success) return reply.status(400).send(parsed.error.flatten());
    const db: any = (fastify as any).db;
    if (!db) return reply.status(501).send({ error: "DB not configured" });
    const force = (req.query as any)?.force === "true";
    // Coherence check: prevent orphaning live bookings unless force
    if (!force) {
      const { bookings } = await import("../db/schema.js");
      const { and: and2, eq: eq2 } = await import("drizzle-orm");
      const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: process.env.CLUB_TIMEZONE || "Europe/Rome" });
      for (const entry of parsed.data) {
        const open = entry.open_time ?? null;
        const close = entry.close_time ?? null;
        const isClosed = !!entry.is_closed;
        // Only check per-court special timetables (not global null, which is fallback)
        // Check future bookings for this court and dayOfWeek
        const courtId = entry.court_id ?? null;
        // If global timetable (court_id null) skip strict check — fallback, not orphaning
        if (courtId === null) continue;
        const allBookings: any[] = await db.select().from(bookings).where(and2(eq2(bookings.courtId, courtId)));
        const conflicts: any[] = [];
        for (const b of allBookings) {
          if (!["pending_approval","approved"].includes(b.status)) continue;
          if (b.date < todayStr) continue;
          const dow = new Date(b.date + "T12:00:00Z").getUTCDay();
          if (dow !== entry.day_of_week) continue;
          if (isClosed) { conflicts.push({ id: b.id, date: b.date, startTime: b.startTime, endTime: b.endTime, reason: "day closed" }); continue; }
          if (!open || !close) continue;
          const o = open.slice(0,5), c = close.slice(0,5);
          const s = String(b.startTime).slice(0,5), e = String(b.endTime).slice(0,5);
          if (s < o || e > c) conflicts.push({ id: b.id, date: b.date, startTime: s, endTime: e, reason: `outside ${o}-${c}` });
          // duration change is tolerated — existing bookings keep their endTime, just warn if not aligned? not blocking
        }
        if (conflicts.length) {
          return reply.status(409).send({ error: "Timetable change would orphan live bookings", conflicts, dayOfWeek: entry.day_of_week, courtId, hint: "Use ?force=true to override or cancel/move conflicting bookings first" });
        }
      }
    }
    for (const entry of parsed.data) {
      await db
        .insert(timetables)
        .values({
          courtId: entry.court_id ?? null,
          dayOfWeek: entry.day_of_week,
          openTime: entry.open_time ?? null,
          closeTime: entry.close_time ?? null,
          slotDurationMinutes: entry.slot_duration_minutes ?? 60,
          isClosed: entry.is_closed ?? false,
        })
        .onConflictDoUpdate({
          target: [timetables.courtId, timetables.dayOfWeek],
          set: {
            openTime: entry.open_time ?? null,
            closeTime: entry.close_time ?? null,
            slotDurationMinutes: entry.slot_duration_minutes ?? 60,
            isClosed: entry.is_closed ?? false,
          },
        });
    }
    return reply.send({ updated: parsed.data.length });
  });
}
