import type { FastifyInstance } from "fastify";
import { users, bookings, blocks, auditLog } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { profileSchema, registerSchema } from "../types/schemas.js";
import bcrypt from "bcryptjs";

export default async function userRoutes(fastify: FastifyInstance) {
  fastify.get("/api/users/me", { preHandler: [fastify.authenticate] }, async (req, _reply) => {
    const db: any = (req as any).server.db ?? (req as any).server;
    const maybeDb = (req as any).server.db ?? (req as any).server["db"];
    const authUser = (req as any).user;
    if (maybeDb) {
      const rows = await maybeDb.select().from(users).where(eq(users.id, authUser.id)).limit(1);
      if (rows[0]) return { id: rows[0].id, username: rows[0].username, email: rows[0].email, role: rows[0].role, preferred_language: rows[0].preferredLanguage, preferred_sport: rows[0].preferredSport, first_name: rows[0].firstName, last_name: rows[0].lastName, mobile: rows[0].mobile, telegram_chat_id: rows[0].telegramChatId, gender: rows[0].gender, birthdate: rows[0].birthdate };
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
    if (body.email !== undefined) updates.email = body.email ? body.email.toLowerCase() : null;
    if (body.preferred_language) updates.preferredLanguage = body.preferred_language;
    if (body.preferred_sport !== undefined) updates.preferredSport = body.preferred_sport || null;
    if (body.mobile !== undefined) updates.mobile = body.mobile || null;
    if (body.telegram_chat_id !== undefined) updates.telegramChatId = body.telegram_chat_id || null;
    if (body.gender !== undefined) updates.gender = body.gender;
    if (body.birthdate !== undefined) updates.birthdate = body.birthdate || null;
    if (Object.keys(updates).length === 0) return reply.status(400).send({ error: "No fields to update" });
    updates.updatedAt = new Date();
    if (updates.email) {
      const dup = await db.select().from(users).where(eq(users.email, updates.email)).limit(1);
      if (dup[0] && String(dup[0].id) !== String(user.id)) return reply.status(409).send({ error: "username or email already taken" });
    }
    try {
      const [row] = await db.update(users).set(updates).where(eq(users.id, user.id)).returning();
      return reply.send({ id: row.id, username: row.username, email: row.email, preferred_language: row.preferredLanguage, preferred_sport: row.preferredSport, first_name: row.firstName, last_name: row.lastName, mobile: row.mobile, telegram_chat_id: row.telegramChatId, gender: row.gender, birthdate: row.birthdate });
    } catch (e: any) {
      if (String(e.code) === "23505") return reply.status(409).send({ error: "username or email already taken" });
      throw e;
    }
  });

  fastify.get("/api/users", { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] }, async (req, reply) => {
    const db: any = (req as any).server.db;
    if (!db) return reply.send([]);
    const { q, role, search } = (req.query as any) || {};
    const term = (q || search || "").toLowerCase();
    let rows = await db.select().from(users);
    if (term) {
      rows = rows.filter((r: any) => [r.username, r.email, r.firstName, r.lastName, r.mobile].some((v: any) => v && String(v).toLowerCase().includes(term)));
    }
    if (role && ["visitor","associate","admin"].includes(role)) {
      rows = rows.filter((r: any) => r.role === role);
    }
    return reply.send(rows.map((r: any) => ({ id: r.id, username: r.username, email: r.email, role: r.role, preferred_language: r.preferredLanguage, preferred_sport: r.preferredSport, first_name: r.firstName, last_name: r.lastName, mobile: r.mobile, telegram_chat_id: r.telegramChatId, gender: r.gender, birthdate: r.birthdate })));
  });

  fastify.patch("/api/users/:id/role", { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] }, async (req, reply) => {
    const db: any = (fastify as any).server.db ?? (fastify as any).db;
    if (!db) return reply.status(501).send({ error: "DB not configured" });
    const { id } = req.params as any;
    const { role } = (req as any).body as any;
    if (!["visitor", "associate", "admin"].includes(role)) return reply.status(400).send({ error: "Invalid role" });
    // Prevent demoting the last admin
    if (role !== "admin") {
      const targetRows = await db.select().from(users).where(eq(users.id, id)).limit(1);
      const target = targetRows[0];
      if (target?.role === "admin") {
        const admins = await db.select().from(users).where(eq(users.role, "admin"));
        if (admins.length <= 1) return reply.status(400).send({ error: "Cannot demote the last admin" });
      }
    }
    const [row] = await db.update(users).set({ role }).where(eq(users.id, id)).returning();
    if (!row) return reply.status(404).send({ error: "Not found" });
    return reply.send({ id: row.id, role: row.role });
  });

  fastify.post("/api/users", { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] }, async (req, reply) => {
    const parsed = registerSchema.safeParse((req as any).body);
    if (!parsed.success) return reply.status(400).send(parsed.error.flatten());
    const db: any = (fastify as any).db;
    if (!db) return reply.status(501).send({ error: "DB not configured" });
    const { password, ...data } = parsed.data as any;
    const role = (req.body as any).role && ["visitor","associate","admin"].includes((req.body as any).role) ? (req.body as any).role : "visitor";
    const passwordHash = await bcrypt.hash(password, 10);
    const emailVal = (data.email as string | null | undefined) ? String(data.email).toLowerCase() : null;
    if (emailVal) {
      const dup = await db.select().from(users).where(eq(users.email, emailVal)).limit(1);
      if (dup[0]) return reply.status(409).send({ error: "username or email already taken" });
    }
    try {
      const [user] = await db.insert(users).values({ username: data.username, email: emailVal, passwordHash, firstName: data.first_name, lastName: data.last_name, role, preferredLanguage: data.preferred_language ?? "it" }).returning();
      return reply.status(201).send({ id: user.id, username: user.username, email: user.email, role: user.role });
    } catch (e: any) {
      if (String(e.code) === "23505") return reply.status(409).send({ error: "username or email already taken" });
      throw e;
    }
  });

  fastify.patch("/api/users/:id", { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] }, async (req, reply) => {
    const db: any = (fastify as any).server.db ?? (fastify as any).db ?? (fastify as any).db;
    if (!db) return reply.status(501).send({ error: "DB not configured" });
    const { id } = req.params as any;
    const parsed = profileSchema.safeParse((req as any).body);
    if (!parsed.success) return reply.status(400).send(parsed.error.flatten());
    const body = parsed.data as any;
    // allow role via same endpoint
    const role = (req.body as any).role;
    // Prevent demoting the last admin via this endpoint
    if (role && role !== "admin") {
      const targetRows = await db.select().from(users).where(eq(users.id, id)).limit(1);
      const target = targetRows[0];
      if (target?.role === "admin") {
        const admins = await db.select().from(users).where(eq(users.role, "admin"));
        if (admins.length <= 1) return reply.status(400).send({ error: "Cannot demote the last admin" });
      }
    }
    const updates: any = {};
    if (body.username) updates.username = body.username;
    if (body.first_name) updates.firstName = body.first_name;
    if (body.last_name) updates.lastName = body.last_name;
    if (body.email !== undefined) updates.email = body.email ? body.email.toLowerCase() : null;
    if (body.preferred_language) updates.preferredLanguage = body.preferred_language;
    if (body.preferred_sport !== undefined) updates.preferredSport = body.preferred_sport || null;
    if (body.mobile !== undefined) updates.mobile = body.mobile || null;
    if (body.telegram_chat_id !== undefined) updates.telegramChatId = body.telegram_chat_id || null;
    if (body.gender !== undefined) updates.gender = body.gender;
    if (body.birthdate !== undefined) updates.birthdate = body.birthdate || null;
    if (role && ["visitor","associate","admin"].includes(role)) updates.role = role;
    if ((req.body as any).password) updates.passwordHash = await bcrypt.hash((req.body as any).password, 10);
    if (Object.keys(updates).length === 0) return reply.status(400).send({ error: "No fields to update" });
    updates.updatedAt = new Date();
    if (updates.email) {
      const dup = await db.select().from(users).where(eq(users.email, updates.email)).limit(1);
      if (dup[0] && String(dup[0].id) !== String(id)) return reply.status(409).send({ error: "username or email already taken" });
    }
    try {
      const [row] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
      if (!row) return reply.status(404).send({ error: "Not found" });
      return reply.send({ id: row.id, username: row.username, email: row.email, role: row.role });
    } catch (e: any) {
      if (String(e.code) === "23505") return reply.status(409).send({ error: "username or email already taken" });
      throw e;
    }
  });

  fastify.delete("/api/users/:id", { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] }, async (req, reply) => {
    const db: any = (fastify as any).server.db ?? (fastify as any).db;
    if (!db) return reply.status(501).send({ error: "DB not configured" });
    const { id } = req.params as any;
    const user = (req as any).user;
    if (String(id) === String(user.id)) return reply.status(400).send({ error: "Cannot delete yourself" });
    // Prevent deleting the last admin
    const targetRows = await db.select().from(users).where(eq(users.id, id)).limit(1);
    const target = targetRows[0];
    if (!target) return reply.status(404).send({ error: "Not found" });
    if (target.role === "admin") {
      const admins = await db.select().from(users).where(eq(users.role, "admin"));
      if (admins.length <= 1) return reply.status(400).send({ error: "Cannot delete the last admin" });
    }
    // Cascade delete bookings to prevent FK violation (user_id FK without cascade)
    try {
      await db.delete(bookings).where(eq(bookings.userId, id));
    } catch {}
    // Also clear FK references in other tables
    try {
      await db.update(bookings).set({ reviewedBy: null } as any).where(eq(bookings.reviewedBy, id));
    } catch {}
    try {
      await db.update(blocks).set({ createdBy: null } as any).where(eq(blocks.createdBy, id));
    } catch {}
    try {
      await db.update(auditLog).set({ actorId: null } as any).where(eq(auditLog.actorId, id));
    } catch {}
    const [row] = await db.delete(users).where(eq(users.id, id)).returning();
    if (!row) return reply.status(404).send({ error: "Not found" });
    return reply.status(204).send();
  });
}
