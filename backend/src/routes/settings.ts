import type { FastifyInstance } from "fastify";
import { settingsSchema } from "../types/schemas.js";

export default async function settingsRoutes(fastify: FastifyInstance) {
  fastify.get("/api/settings", { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] }, async (_req, reply) => {
    // TODO: select from app_settings where id=1
    return reply.send({
      default_slot_duration_minutes: 60,
      booking_hold_minutes: 30,
      max_advance_days: 14,
      min_cancel_hours: 2,
      auto_approve_bookings: false,
    });
  });

  fastify.put("/api/settings", { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] }, async (req, reply) => {
    const parsed = settingsSchema.safeParse((req as any).body);
    if (!parsed.success) return reply.status(400).send(parsed.error.flatten());
    // TODO: update app_settings
    return reply.send({ updated: true, ...parsed.data });
  });
}
