import type { FastifyInstance } from "fastify";
import { courtSchema } from "../types/schemas.js";

export default async function courtRoutes(fastify: FastifyInstance) {
  fastify.get("/api/courts", async (req, reply) => {
    // TODO: drizzle query with filters ?type & active
    return reply.send([]);
  });

  fastify.post("/api/courts", { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] }, async (req, reply) => {
    const parsed = courtSchema.safeParse((req as any).body);
    if (!parsed.success) return reply.status(400).send(parsed.error.flatten());
    // TODO: insert
    return reply.status(201).send({ id: "todo", ...parsed.data });
  });

  fastify.patch("/api/courts/:id", { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] }, async (req, reply) => {
    return reply.send({ id: (req.params as any).id, updated: true });
  });

  fastify.delete("/api/courts/:id", { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] }, async (req, reply) => {
    return reply.status(204).send();
  });
}
