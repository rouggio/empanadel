import type { FastifyInstance } from "fastify";
import { registerSchema, loginSchema } from "../types/schemas.js";
import * as argon2 from "argon2";
import { users, bookings, appSettings } from "../db/schema.js";
import { eq, or, and } from "drizzle-orm";

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post("/api/auth/register", async (req, reply) => {
    const parsed = registerSchema.safeParse((req as any).body);
    if (!parsed.success) return reply.status(400).send(parsed.error.flatten());
    const { password, guest_token, ...data } = parsed.data as any;
    const passwordHash = await argon2.hash(password);

    const db: any = (fastify as any).db;
    if (!db) {
      // No DB (dev without docker) — fallback to dummy
      const user = { id: "dev-" + Date.now(), username: data.username, role: "visitor" as const, email: data.email };
      const token = fastify.jwt.sign({ id: user.id, username: user.username, role: user.role });
      return reply.status(201).send({ user, token });
    }

    try {
      const [user] = await db
        .insert(users)
        .values({
          username: data.username,
          email: data.email,
          passwordHash,
          firstName: data.first_name,
          lastName: data.last_name,
          role: "visitor",
        })
        .returning();

      // Link guest_token hold if present: pending_registration -> pending_approval
      if (guest_token) {
        const settingsRows = await db.select().from(appSettings).where(eq(appSettings.id, 1));
        const autoApprove = settingsRows[0]?.autoApproveBookings ?? false;
        const nextStatus = autoApprove ? "approved" : "pending_approval";
        await db
          .update(bookings)
          .set({ userId: user.id, status: nextStatus as any, guestToken: null, expiresAt: null })
          .where(and(eq(bookings.guestToken, guest_token), eq(bookings.status, "pending_registration")));
      }

      const token = fastify.jwt.sign({ id: user.id, username: user.username, role: user.role });
      // Set refresh as httpOnly cookie (optional)
      reply.setCookie?.("refresh_token", (fastify.jwt.sign as any)({ id: user.id }, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d" }), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      });
      return reply.status(201).send({ user: { id: user.id, username: user.username, email: user.email, role: user.role }, token });
    } catch (e: any) {
      if (String(e.message).includes("unique") || String(e.code) === "23505") {
        return reply.status(409).send({ error: "username or email already taken" });
      }
      req.log.error(e);
      return reply.status(500).send({ error: "Registration failed" });
    }
  });

  fastify.post("/api/auth/login", async (req, reply) => {
    const parsed = loginSchema.safeParse((req as any).body);
    if (!parsed.success) return reply.status(400).send(parsed.error.flatten());
    const { username, email, password } = parsed.data;
    const db: any = (fastify as any).db;
    if (!db) return reply.status(501).send({ error: "DB not configured — set DATABASE_URL" });

    const identifier = (email || username)!.toLowerCase();
    const rows = await db
      .select()
      .from(users)
      .where(or(eq(users.email, identifier), eq(users.username, identifier)))
      .limit(1);
    // Also try case-sensitive username if not found via lower
    let user = rows[0];
    if (!user && username) {
      const r2 = await db.select().from(users).where(eq(users.username, username)).limit(1);
      user = r2[0];
    }
    if (!user) return reply.status(401).send({ error: "Invalid credentials" });
    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) return reply.status(401).send({ error: "Invalid credentials" });

    const token = fastify.jwt.sign({ id: user.id, username: user.username, role: user.role });
    reply.setCookie?.("refresh_token", (fastify.jwt.sign as any)({ id: user.id }, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d" }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
    return reply.send({ user: { id: user.id, username: user.username, email: user.email, role: user.role }, token });
  });

  fastify.post("/api/auth/refresh", { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const user = (req as any).user;
    const token = fastify.jwt.sign({ id: user.id, username: user.username, role: user.role });
    return reply.send({ token });
  });

  fastify.post("/api/auth/logout", async (_req, reply) => {
    reply.clearCookie?.("refresh_token", { path: "/" });
    return reply.send({ ok: true });
  });
}
