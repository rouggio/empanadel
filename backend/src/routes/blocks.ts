import type { FastifyInstance } from "fastify";
import { blockSchema, blockingRuleSchema } from "../types/schemas.js";

export default async function blockRoutes(fastify: FastifyInstance) {
  fastify.get("/api/blocks", { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] }, async (_req, reply) => reply.send([]));
  fastify.post("/api/blocks", { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] }, async (req, reply) => {
    const parsed = blockSchema.safeParse((req as any).body);
    if (!parsed.success) return reply.status(400).send(parsed.error.flatten());
    return reply.status(201).send({ id: "todo", ...parsed.data });
  });
  fastify.delete("/api/blocks/:id", { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] }, async (_req, reply) => reply.status(204).send());

  fastify.get("/api/blocking-rules", { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] }, async (_req, reply) => reply.send([]));
  fastify.post("/api/blocking-rules", { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] }, async (req, reply) => {
    const parsed = blockingRuleSchema.safeParse((req as any).body);
    if (!parsed.success) return reply.status(400).send(parsed.error.flatten());
    return reply.status(201).send({ id: "todo", ...parsed.data });
  });
  fastify.patch("/api/blocking-rules/:id", { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] }, async (req, reply) => reply.send({ id: (req.params as any).id }));
  fastify.delete("/api/blocking-rules/:id", { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] }, async (_req, reply) => reply.status(204).send());
}
