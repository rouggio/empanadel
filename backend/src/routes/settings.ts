import type { FastifyInstance } from "fastify";
import { settingsSchema } from "../types/schemas.js";
import { appSettings } from "../db/schema.js";
import { eq } from "drizzle-orm";

export default async function settingsRoutes(fastify: FastifyInstance) {
  // Public club info for footer (no auth)
  fastify.get("/api/club-info", async (_req, reply) => {
    const db: any = (_req as any).server.db ?? (_req as any).db;
    if (!db) return reply.send({ club_name: "Green Village", club_phone: "3923047417", club_address: "" });
    try {
      const rows = await db.select().from(appSettings).where(eq(appSettings.id, 1));
      const s = rows[0];
      if (!s) return reply.send({ club_name: "Green Village", club_phone: "3923047417", club_address: "" });
      return reply.send({ club_name: s.clubName || "Green Village", club_phone: s.clubPhone || "3923047417", club_address: s.clubAddress || "" });
    } catch {
      return reply.send({ club_name: "Green Village", club_phone: "3923047417", club_address: "" });
    }
  });

  fastify.get("/api/settings", { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] }, async (_req, reply) => {
    const db: any = (_req as any).server.db;
    if (!db) {
      return reply.send({
        default_slot_duration_minutes: 60,
        booking_hold_minutes: 30,
        max_advance_days: 14,
        min_cancel_hours: 2,
        auto_approve_bookings: false,
        club_name: "Green Village",
        club_phone: "3923047417",
        club_address: "",
      });
    }
    const rows = await db.select().from(appSettings).where(eq(appSettings.id, 1));
    const s = rows[0];
    if (!s) return reply.send({ default_slot_duration_minutes: 60, booking_hold_minutes: 30, max_advance_days: 14, min_cancel_hours: 2, auto_approve_bookings: false, club_name: "Green Village", club_phone: "3923047417", club_address: "" });
    return reply.send({
      default_slot_duration_minutes: s.defaultSlotDurationMinutes,
      booking_hold_minutes: s.bookingHoldMinutes,
      max_advance_days: s.maxAdvanceDays,
      min_cancel_hours: s.minCancelHours,
      auto_approve_bookings: s.autoApproveBookings,
      club_name: s.clubName,
      club_phone: s.clubPhone,
      club_address: s.clubAddress,
    });
  });

  fastify.put("/api/settings", { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] }, async (req, reply) => {
    const parsed = settingsSchema.safeParse((req as any).body);
    if (!parsed.success) return reply.status(400).send(parsed.error.flatten());
    const db: any = (fastify as any).db;
    if (!db) return reply.status(501).send({ error: "DB not configured" });
    const updates: any = {};
    if (parsed.data.default_slot_duration_minutes !== undefined) updates.defaultSlotDurationMinutes = parsed.data.default_slot_duration_minutes;
    if (parsed.data.booking_hold_minutes !== undefined) updates.bookingHoldMinutes = parsed.data.booking_hold_minutes;
    if (parsed.data.max_advance_days !== undefined) updates.maxAdvanceDays = parsed.data.max_advance_days;
    if (parsed.data.min_cancel_hours !== undefined) updates.minCancelHours = parsed.data.min_cancel_hours;
    if (parsed.data.auto_approve_bookings !== undefined) updates.autoApproveBookings = parsed.data.auto_approve_bookings;
    if (parsed.data.club_name !== undefined) updates.clubName = parsed.data.club_name || null;
    if (parsed.data.club_phone !== undefined) updates.clubPhone = parsed.data.club_phone || null;
    if (parsed.data.club_address !== undefined) updates.clubAddress = parsed.data.club_address || null;
    updates.updatedAt = new Date();
    const [row] = await db.update(appSettings).set(updates).where(eq(appSettings.id, 1)).returning();
    return reply.send(row);
  });
}
