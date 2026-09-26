import type { FastifyInstance } from "fastify";
import { registerSchema, loginSchema } from "../types/schemas.js";
import bcrypt from "bcryptjs";
import { users } from "../db/schema.js";
import { eq, or } from "drizzle-orm";

const REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || "7d";

function refreshCookieOpts() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
}

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post("/api/auth/register", async (req, reply) => {
    const parsed = registerSchema.safeParse((req as any).body);
    if (!parsed.success) return reply.status(400).send(parsed.error.flatten());
    const { password, ...data } = parsed.data as any;
    const passwordHash = await bcrypt.hash(password, 10);

    const db: any = (fastify as any).db;
    if (!db) {
      // No DB (dev without docker) — fallback to dummy
      const user = { id: "dev-" + Date.now(), username: data.username, role: "visitor" as const, email: data.email };
      const token = fastify.jwt.sign({ id: user.id, username: user.username, role: user.role });
      return reply.status(201).send({ user, token });
    }

    try {
      const emailVal = (data.email as string | null | undefined)?.toLowerCase?.() ?? null;
      if (emailVal) {
        const dup = await db.select().from(users).where(eq(users.email, emailVal)).limit(1);
        if (dup[0]) return reply.status(409).send({ error: "username or email already taken" });
      }
      const [user] = await db
        .insert(users)
        .values({
          username: data.username,
          email: emailVal,
          mobile: data.mobile,
          passwordHash,
          firstName: data.first_name,
          lastName: data.last_name,
          role: "visitor",
          preferredLanguage: data.preferred_language ?? "it",
        })
        .returning();

      const token = fastify.jwt.sign({ id: user.id, username: user.username, role: user.role, preferred_language: user.preferredLanguage } as any);
      // Persistent session: httpOnly refresh cookie (7d sliding). SPA renews the
      // short-lived access token via POST /api/auth/refresh — no login needed.
      reply.setCookie?.("refresh_token", (fastify.jwt.sign as any)({ id: user.id }, { expiresIn: REFRESH_EXPIRES_IN }), refreshCookieOpts());
      return reply.status(201).send({ user: { id: user.id, username: user.username, email: user.email, role: user.role, preferred_language: user.preferredLanguage }, token });
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
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return reply.status(401).send({ error: "Invalid credentials" });

    const token = fastify.jwt.sign({ id: user.id, username: user.username, role: user.role, preferred_language: user.preferredLanguage } as any);
    reply.setCookie?.("refresh_token", (fastify.jwt.sign as any)({ id: user.id }, { expiresIn: REFRESH_EXPIRES_IN }), refreshCookieOpts());
    return reply.send({ user: { id: user.id, username: user.username, email: user.email, role: user.role, preferred_language: user.preferredLanguage }, token });
  });

  // Silent session renewal: verifies the httpOnly refresh cookie (NOT the access
  // token — the old auth-gated version could never renew an expired session),
  // issues a fresh 15m access token and rotates the cookie (7d sliding window).
  fastify.post("/api/auth/refresh", async (req, reply) => {
    const db: any = (fastify as any).db;
    if (!db) return reply.status(501).send({ error: "DB not configured" });
    const raw = (req as any).cookies?.refresh_token;
    if (!raw) return reply.status(401).send({ error: "No refresh session" });
    let payload: any;
    try {
      payload = fastify.jwt.verify(raw);
    } catch {
      return reply.status(401).send({ error: "Refresh expired — please login again" });
    }
    const rows = await db.select().from(users).where(eq(users.id, payload.id)).limit(1);
    const user = rows[0];
    if (!user) return reply.status(401).send({ error: "User not found" });
    const token = fastify.jwt.sign({ id: user.id, username: user.username, role: user.role, preferred_language: user.preferredLanguage } as any);
    reply.setCookie?.("refresh_token", (fastify.jwt.sign as any)({ id: user.id }, { expiresIn: REFRESH_EXPIRES_IN }), refreshCookieOpts());
    return reply.send({
      token,
      user: { id: user.id, username: user.username, email: user.email, role: user.role, preferred_language: user.preferredLanguage },
    });
  });

  fastify.post("/api/auth/logout", async (_req, reply) => {
    reply.clearCookie?.("refresh_token", { path: "/" });
    return reply.send({ ok: true });
  });
}
