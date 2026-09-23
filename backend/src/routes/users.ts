import type { FastifyInstance } from "fastify";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { profileSchema } from "../types/schemas.js";

export default async function userRoutes(fastify: FastifyInstance) {
  fastify.get("/api/users/me", { preHandler: [fastify.authenticate] }, async (req, _reply) => {
    const db: any = (req as any).server.db ?? (req as any).server;
    const maybeDb = (req as any).server.db ?? (req as any).server["db"];
    const authUser = (req as any).user;
    if (maybeDb) {
      const rows = await maybeDb.select().from(users).where(eq(users.id, authUser.id)).limit(1);
      if (rows[0]) return { id: rows[0].id, username: rows[0].username, email: rows[0].email, role: rows[0].role, preferred_language: rows[0].preferredLanguage, first_name: rows[0].firstName, last_name: rows[0].lastName, mobile: rows[0].mobile, gender: rows[0].gender, birthdate: rows[0].birthdate };
    }
    return authUser;
  });

  fastify.patch("/api/users/me", { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const db: any = (req as any).server.db;
    if (!db) return reply.send({ updated: true });
    const parsed = profileSchema.safeParse((req as any).body);
    if (!parsed.success) return reply.status(400).send(parsed.error.flatten());
    const body = parsed.data as any;
    const user = (req as any).user;
    const updates: any = {};
    if (body.username) updates.username = body.username;
    if (body.first_name) updates.firstName = body.first_name;
    if (body.last_name) updates.lastName = body.last_name;
    if (body.email) updates.email = body.email.toLowerCase();
    if (body.preferred_language) updates.preferredLanguage = body.preferred_language;
    if (body.mobile !== undefined) updates.mobile = body.mobile || null;
    if (body.gender !== undefined) updates.gender = body.gender;
    if (body.birthdate !== undefined) updates.birthdate = body.birthdate || null;
    if (Object.keys(updates).length === 0) return reply.status(400).send({ error: "No fields to update" });
    updates.updatedAt = new Date();
    try {
      const [row] = await db.update(users).set(updates).where(eq(users.id, user.id)).returning();
      return reply.send({ id: row.id, username: row.username, email: row.email, preferred_language: row.preferredLanguage, first_name: row.firstName, last_name: row.lastName, mobile: row.mobile, gender: row.gender, birthdate: row.birthdate });
    } catch (e: any) {
      if (String(e.code) === "23505") return reply.status(409).send({ error: "username or email already taken" });
      throw e;
    }
  });

  fastify.get("/api/users", { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] }, async (req, reply) => {
    const db: any = (req as any).server.db;
    if (!db) return reply.send([]);
    const rows = await db.select().from(users);
    return reply.send(rows.map((r: any) => ({ id: r.id, username: r.username, email: r.email, role: r.role, preferred_language: r.preferredLanguage, first_name: r.firstName, last_name: r.lastName, mobile: r.mobile, gender: r.gender, birthdate: r.birthdate })));
  });

  fastify.patch("/api/users/:id/role", { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] }, async (req, reply) => {
    const db: any = (req as any).server.db;
    if (!db) return reply.status(501).send({ error: "DB not configured" });
    const { id } = req.params as any;
    const { role } = (req as any).body as any;
    if (!["visitor", "associate", "admin"].includes(role)) return reply.status(400).send({ error: "Invalid role" });
    const [row] = await db.update(users).set({ role }).where(eq(users.id, id)).returning();
    if (!row) return reply.status(404).send({ error: "Not found" });
    return reply.send({ id: row.id, role: row.role });
  });
}
