import type { FastifyInstance } from "fastify";
import { timetableBulkSchema } from "../types/schemas.js";

export default async function timetableRoutes(fastify: FastifyInstance) {
  fastify.get("/api/timetable", async (req, reply) => {
    return reply.send([]);
  });

  fastify.put("/api/timetable", { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] }, async (req, reply) => {
    const parsed = timetableBulkSchema.safeParse((req as any).body);
    if (!parsed.success) return reply.status(400).send(parsed.error.flatten());
    return reply.send({ updated: parsed.data.length });
  });
}
