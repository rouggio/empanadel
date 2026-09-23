import type { FastifyInstance } from "fastify";
import { bookingIntentSchema } from "../types/schemas.js";
import { randomUUID } from "crypto";

export default async function bookingRoutes(fastify: FastifyInstance) {
  fastify.post("/api/bookings/intent", async (req, reply) => {
    const parsed = bookingIntentSchema.safeParse((req as any).body);
    if (!parsed.success) return reply.status(400).send(parsed.error.flatten());
    const guestToken = randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    // TODO: create booking with status pending_registration
    return reply.status(201).send({ guest_token: guestToken, expires_at: expiresAt, status: "pending_registration" });
  });

  fastify.post("/api/bookings", { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const parsed = bookingIntentSchema.safeParse((req as any).body);
    if (!parsed.success) return reply.status(400).send(parsed.error.flatten());
    // TODO: check availability + blocks + overlaps, respect auto_approve setting
    return reply.status(201).send({ id: randomUUID(), status: "pending_approval", ...parsed.data });
  });

  fastify.get("/api/bookings", { preHandler: [fastify.authenticate] }, async (req, reply) => {
    return reply.send([]);
  });

  fastify.get("/api/bookings/:id", { preHandler: [fastify.authenticate] }, async (req, reply) => {
    return reply.send({ id: (req.params as any).id });
  });

  fastify.post("/api/bookings/:id/approve", { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] }, async (req, reply) => {
    return reply.send({ id: (req.params as any).id, status: "approved" });
  });

  fastify.post("/api/bookings/:id/reject", { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] }, async (req, reply) => {
    return reply.send({ id: (req.params as any).id, status: "rejected" });
  });

  fastify.post("/api/bookings/:id/cancel", { preHandler: [fastify.authenticate] }, async (req, reply) => {
    return reply.send({ id: (req.params as any).id, status: "cancelled" });
  });
}
