import type { FastifyInstance } from "fastify";
import { courtSchema } from "../types/schemas.js";
import { courts } from "../db/schema.js";
import { eq, asc } from "drizzle-orm";

export default async function courtRoutes(fastify: FastifyInstance) {
  fastify.get("/api/courts", async (req, reply) => {
    const db: any = (fastify as any).db;
    const { type, active } = (req.query as any) || {};
    if (!db) {
      // Fallback demo when no DB
      return reply.send([
        { id: "c1", number: 1, type: "tennis", name: "Central Tennis", surface: "clay", is_active: true },
        { id: "c2", number: 2, type: "tennis", surface: "synthetic", is_active: true },
        { id: "c3", number: 3, type: "padel", name: "Padel 1", is_active: true },
        { id: "c4", number: 4, type: "padel", name: "Padel 2", is_active: true },
      ]);
    }
    let rows = await db.select().from(courts).orderBy(asc(courts.number));
    if (type) rows = rows.filter((r: any) => r.type === type);
    if (active !== undefined) {
      const want = active === "true" || active === true;
      rows = rows.filter((r: any) => r.isActive === want);
    }
    // Map snake_case for frontend
    return reply.send(rows.map((r: any) => ({ id: r.id, number: r.number, type: r.type, name: r.name, surface: r.surface, is_active: r.isActive })));
  });

  fastify.post("/api/courts", { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] }, async (req, reply) => {
    const parsed = courtSchema.safeParse((req as any).body);
    if (!parsed.success) return reply.status(400).send(parsed.error.flatten());
    const db: any = (fastify as any).db;
    if (!db) return reply.status(501).send({ error: "DB not configured" });
    const { number, type, name, surface, is_active } = parsed.data;
    try {
      const [row] = await db
        .insert(courts)
        .values({ number, type: type as any, name: name ?? null, surface: surface ?? null, isActive: is_active ?? true })
        .returning();
      return reply.status(201).send(row);
    } catch (e: any) {
      if (String(e.code) === "23505") return reply.status(409).send({ error: "Court number already exists" });
      throw e;
    }
  });

  fastify.patch("/api/courts/:id", { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] }, async (req, reply) => {
    const db: any = (fastify as any).db;
    if (!db) return reply.status(501).send({ error: "DB not configured" });
    const { id } = req.params as any;
    const body = (req as any).body as any;
    const updates: any = {};
    if (body.number !== undefined) updates.number = body.number;
    if (body.type !== undefined) updates.type = body.type;
    if (body.name !== undefined) updates.name = body.name;
    if (body.surface !== undefined) updates.surface = body.surface;
    if (body.is_active !== undefined) updates.isActive = body.is_active;
    updates.updatedAt = new Date();
    const [row] = await db.update(courts).set(updates).where(eq(courts.id, id)).returning();
    if (!row) return reply.status(404).send({ error: "Not found" });
    return reply.send(row);
  });

  fastify.delete("/api/courts/:id", { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] }, async (req, reply) => {
    const db: any = (fastify as any).db;
    if (!db) return reply.status(501).send({ error: "DB not configured" });
    const { id } = req.params as any;
    // Soft-disable: set isActive false instead of delete to keep history
    await db.update(courts).set({ isActive: false }).where(eq(courts.id, id));
    return reply.status(204).send();
  });
}
