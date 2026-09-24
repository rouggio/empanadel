import type { FastifyInstance } from "fastify";
import { blockSchema, blockingRuleSchema } from "../types/schemas.js";
import { blocks, blockingRules } from "../db/schema.js";
import { eq, desc } from "drizzle-orm";

export default async function blockRoutes(fastify: FastifyInstance) {
  fastify.get("/api/blocks", { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] }, async (_req, reply) => {
    const db: any = (_req as any).server.db;
    if (!db) return reply.send([]);
    const rows = await db.select().from(blocks).orderBy(desc(blocks.startAt));
    return reply.send(rows);
  });
  fastify.post("/api/blocks", { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] }, async (req, reply) => {
    const parsed = blockSchema.safeParse((req as any).body);
    if (!parsed.success) return reply.status(400).send(parsed.error.flatten());
    const db: any = (fastify as any).db;
    if (!db) return reply.status(501).send({ error: "DB not configured" });
    const { court_id, start_at, end_at, reason } = parsed.data;
    const [row] = await db.insert(blocks).values({ courtId: court_id ?? null, startAt: new Date(start_at), endAt: new Date(end_at), reason, createdBy: (req as any).user.id }).returning();
    return reply.status(201).send(row);
  });
  fastify.delete("/api/blocks/:id", { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] }, async (req, reply) => {
    const db: any = (fastify as any).db;
    if (!db) return reply.status(501).send({ error: "DB not configured" });
    const { id } = req.params as any;
    await db.delete(blocks).where(eq(blocks.id, id));
    return reply.status(204).send();
  });

  fastify.get("/api/blocking-rules", { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] }, async (req, reply) => {
    const db: any = (req as any).server.db;
    if (!db) return reply.send([]);
    const rows = await db.select().from(blockingRules);
    return reply.send(rows);
  });
  fastify.post("/api/blocking-rules", { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] }, async (req, reply) => {
    const parsed = blockingRuleSchema.safeParse((req as any).body);
    if (!parsed.success) return reply.status(400).send(parsed.error.flatten());
    const db: any = (fastify as any).db;
    if (!db) return reply.status(501).send({ error: "DB not configured" });
    const { court_id, day_of_week, start_time, end_time, reason, valid_from, valid_until, is_active } = parsed.data;
    const [row] = await db.insert(blockingRules).values({ courtId: court_id ?? null, dayOfWeek: day_of_week, startTime: start_time, endTime: end_time, reason, validFrom: valid_from ?? null, validUntil: valid_until ?? null, isActive: is_active ?? true }).returning();
    return reply.status(201).send(row);
  });
  fastify.patch("/api/blocking-rules/:id", { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] }, async (req, reply) => {
    const db: any = (fastify as any).db;
    if (!db) return reply.status(501).send({ error: "DB not configured" });
    const { id } = req.params as any;
    const body = (req as any).body as any;
    const updates: any = {};
    if (body.court_id !== undefined) updates.courtId = body.court_id || null;
    if (body.day_of_week !== undefined) updates.dayOfWeek = body.day_of_week;
    if (body.start_time !== undefined) updates.startTime = body.start_time;
    if (body.end_time !== undefined) updates.endTime = body.end_time;
    if (body.reason !== undefined) updates.reason = body.reason;
    if (body.is_active !== undefined) updates.isActive = body.is_active;
    const [row] = await db.update(blockingRules).set(updates).where(eq(blockingRules.id, id)).returning();
    if (!row) return reply.status(404).send({ error: "Not found" });
    return reply.send(row);
  });
  fastify.delete("/api/blocking-rules/:id", { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] }, async (req, reply) => {
    const db: any = (fastify as any).db;
    if (!db) return reply.status(501).send({ error: "DB not configured" });
    const { id } = req.params as any;
    await db.delete(blockingRules).where(eq(blockingRules.id, id));
    return reply.status(204).send();
  });
}
