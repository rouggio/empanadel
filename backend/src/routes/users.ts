import type { FastifyInstance } from "fastify";

export default async function userRoutes(fastify: FastifyInstance) {
  fastify.get("/api/users/me", { preHandler: [fastify.authenticate] }, async (req, _reply) => {
    return (req as any).user;
  });

  fastify.patch("/api/users/me", { preHandler: [fastify.authenticate] }, async (req, reply) => {
    return reply.send({ updated: true });
  });

  fastify.get("/api/users", { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] }, async (_req, reply) => {
    return reply.send([]);
  });

  fastify.patch("/api/users/:id/role", { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] }, async (req, reply) => {
    return reply.send({ id: (req.params as any).id, role: (req.body as any)?.role });
  });
}
