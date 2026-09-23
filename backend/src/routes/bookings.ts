import type { FastifyInstance } from "fastify";
import { bookingIntentSchema } from "../types/schemas.js";
import { randomUUID } from "crypto";
import { bookings, timetables, appSettings } from "../db/schema.js";
import { eq, and, or, desc } from "drizzle-orm";

function computeEnd(startTime: string, durationMin: number): string {
  const [h, m] = startTime.split(":").map(Number);
  const total = h * 60 + m + durationMin;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}:00`;
}

export default async function bookingRoutes(fastify: FastifyInstance) {
  fastify.post("/api/bookings/intent", async (req, reply) => {
    const parsed = bookingIntentSchema.safeParse((req as any).body);
    if (!parsed.success) return reply.status(400).send(parsed.error.flatten());
    const { court_id, date, start_time } = parsed.data;
    const db: any = (fastify as any).db;

    let duration = 60;
    let expiresAt: Date | null = null;
    let guestToken = randomUUID();

    if (db) {
      // Get duration from timetable or settings
      const dayOfWeek = new Date(date + "T12:00:00Z").getUTCDay();
      const allTT = await db.select().from(timetables);
      let tt = allTT.find((r: any) => String(r.courtId) === String(court_id) && r.dayOfWeek === dayOfWeek);
      if (!tt) tt = allTT.find((r: any) => r.courtId === null && r.dayOfWeek === dayOfWeek);
      if (tt?.slotDurationMinutes) duration = tt.slotDurationMinutes;
      else {
        const s = await db.select().from(appSettings).where(eq(appSettings.id, 1));
        duration = s[0]?.defaultSlotDurationMinutes ?? 60;
      }
      const holdMin = (await db.select().from(appSettings).where(eq(appSettings.id, 1)))[0]?.bookingHoldMinutes ?? 30;
      expiresAt = new Date(Date.now() + holdMin * 60 * 1000);

      const endTime = computeEnd(start_time, duration);
      // Overlap check: any active booking overlapping
      const existing = await db.select().from(bookings).where(and(eq(bookings.courtId, court_id), eq(bookings.date, date)));
      const overlaps = existing.filter(
        (b: any) =>
          ["pending_registration", "pending_approval", "approved"].includes(b.status) &&
          !(b.status === "pending_registration" && b.expiresAt && new Date(b.expiresAt) < new Date()) &&
          b.startTime < endTime &&
          start_time < b.endTime
      );
      if (overlaps.length) return reply.status(409).send({ error: "Slot already booked or held" });

      const [row] = await db
        .insert(bookings)
        .values({
          courtId: court_id,
          userId: null,
          date,
          startTime: start_time,
          endTime,
          status: "pending_registration" as any,
          guestToken,
          expiresAt,
        })
        .returning();
      return reply.status(201).send({ id: row.id, guest_token: guestToken, expires_at: expiresAt?.toISOString(), status: "pending_registration" });
    }

    // No DB fallback
    const exp = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    return reply.status(201).send({ guest_token: guestToken, expires_at: exp, status: "pending_registration" });
  });

  fastify.post("/api/bookings", { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const parsed = bookingIntentSchema.safeParse((req as any).body);
    if (!parsed.success) return reply.status(400).send(parsed.error.flatten());
    const { court_id, date, start_time } = parsed.data;
    const db: any = (fastify as any).db;
    const user = (req as any).user;
    if (!db) return reply.status(201).send({ id: randomUUID(), status: "pending_approval", ...parsed.data });

    let duration = 60;
    const dayOfWeek = new Date(date + "T12:00:00Z").getUTCDay();
    const allTT = await db.select().from(timetables);
    let tt = allTT.find((r: any) => String(r.courtId) === String(court_id) && r.dayOfWeek === dayOfWeek);
    if (!tt) tt = allTT.find((r: any) => r.courtId === null && r.dayOfWeek === dayOfWeek);
    if (tt?.slotDurationMinutes) duration = tt.slotDurationMinutes;
    else {
      const s = await db.select().from(appSettings).where(eq(appSettings.id, 1));
      duration = s[0]?.defaultSlotDurationMinutes ?? 60;
    }
    const endTime = computeEnd(start_time, duration);

    const existing = await db.select().from(bookings).where(and(eq(bookings.courtId, court_id), eq(bookings.date, date)));
    const overlaps = existing.filter(
      (b: any) =>
        ["pending_registration", "pending_approval", "approved"].includes(b.status) &&
        !(b.status === "pending_registration" && b.expiresAt && new Date(b.expiresAt) < new Date()) &&
        b.startTime < endTime &&
        start_time < b.endTime
    );
    if (overlaps.length) return reply.status(409).send({ error: "Slot already booked or held" });

    const settings = await db.select().from(appSettings).where(eq(appSettings.id, 1));
    const autoApprove = settings[0]?.autoApproveBookings ?? false;
    const status = autoApprove ? "approved" : "pending_approval";

    const [row] = await db
      .insert(bookings)
      .values({ courtId: court_id, userId: user.id, date, startTime: start_time, endTime, status: status as any })
      .returning();
    return reply.status(201).send(row);
  });

  fastify.get("/api/bookings", { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const db: any = (fastify as any).db;
    const user = (req as any).user;
    if (!db) return reply.send([]);
    const { mine, status, court_id } = (req.query as any) || {};
    let rows = await db.select().from(bookings).orderBy(desc(bookings.createdAt));
    if (user.role !== "admin" || mine === "true") {
      rows = rows.filter((r: any) => String(r.userId) === String(user.id));
    }
    if (status) rows = rows.filter((r: any) => r.status === status);
    if (court_id) rows = rows.filter((r: any) => String(r.courtId) === String(court_id));
    return reply.send(rows);
  });

  fastify.get("/api/bookings/:id", { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const db: any = (fastify as any).db;
    if (!db) return reply.send({ id: (req.params as any).id });
    const { id } = req.params as any;
    const rows = await db.select().from(bookings).where(eq(bookings.id, id)).limit(1);
    if (!rows[0]) return reply.status(404).send({ error: "Not found" });
    const user = (req as any).user;
    if (user.role !== "admin" && String(rows[0].userId) !== String(user.id)) return reply.status(403).send({ error: "Forbidden" });
    return reply.send(rows[0]);
  });

  fastify.post("/api/bookings/:id/approve", { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] }, async (req, reply) => {
    const db: any = (fastify as any).db;
    if (!db) return reply.send({ id: (req.params as any).id, status: "approved" });
    const { id } = req.params as any;
    const [row] = await db.update(bookings).set({ status: "approved" as any, reviewedBy: (req as any).user.id }).where(eq(bookings.id, id)).returning();
    if (!row) return reply.status(404).send({ error: "Not found" });
    return reply.send(row);
  });

  fastify.post("/api/bookings/:id/reject", { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] }, async (req, reply) => {
    const db: any = (fastify as any).db;
    if (!db) return reply.send({ id: (req.params as any).id, status: "rejected" });
    const { id } = req.params as any;
    const [row] = await db.update(bookings).set({ status: "rejected" as any, reviewedBy: (req as any).user.id }).where(eq(bookings.id, id)).returning();
    if (!row) return reply.status(404).send({ error: "Not found" });
    return reply.send(row);
  });

  fastify.post("/api/bookings/:id/cancel", { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const db: any = (fastify as any).db;
    if (!db) return reply.send({ id: (req.params as any).id, status: "cancelled" });
    const { id } = req.params as any;
    const rows = await db.select().from(bookings).where(eq(bookings.id, id)).limit(1);
    if (!rows[0]) return reply.status(404).send({ error: "Not found" });
    const user = (req as any).user;
    if (user.role !== "admin" && String(rows[0].userId) !== String(user.id)) return reply.status(403).send({ error: "Forbidden" });
    const [row] = await db.update(bookings).set({ status: "cancelled" as any }).where(eq(bookings.id, id)).returning();
    return reply.send(row);
  });
}
