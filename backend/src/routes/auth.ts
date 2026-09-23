import type { FastifyInstance } from "fastify";
import { registerSchema, loginSchema } from "../types/schemas.js";
import * as argon2 from "argon2";
import { randomUUID } from "crypto";

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post("/api/auth/register", async (req, reply) => {
    const parsed = registerSchema.safeParse((req as any).body);
    if (!parsed.success) return reply.status(400).send(parsed.error.flatten());
    const { password, ...data } = parsed.data;
    const passwordHash = await argon2.hash(password);
    // TODO: insert user, handle guest_token linking, check auto_approve
    const user = { id: randomUUID(), username: data.username, role: "visitor" as const };
    const token = fastify.jwt.sign({ id: user.id, username: user.username, role: user.role });
    return reply.status(201).send({ user, token });
  });

  fastify.post("/api/auth/login", async (req, reply) => {
    const parsed = loginSchema.safeParse((req as any).body);
    if (!parsed.success) return reply.status(400).send(parsed.error.flatten());
    // TODO: lookup user, verify argon2
    return reply.status(501).send({ error: "Not implemented — wire to DB" });
  });

  fastify.post("/api/auth/refresh", { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const user = (req as any).user;
    const token = fastify.jwt.sign({ id: user.id, username: user.username, role: user.role });
    return reply.send({ token });
  });

  fastify.post("/api/auth/logout", async (_req, reply) => {
    return reply.send({ ok: true });
  });
}
