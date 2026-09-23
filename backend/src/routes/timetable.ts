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
