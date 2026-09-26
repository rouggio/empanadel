import type { FastifyInstance } from "fastify";
import { announcements, announcementTranslations } from "../db/schema.js";
import { announcementSchema, announcementPatchSchema } from "../types/schemas.js";
import { and, asc, desc, eq } from "drizzle-orm";

const LANGS = ["it", "en", "fr", "de", "es"];
function normalizeLang(v: any): string {
  const s = String(v || "it").toLowerCase();
  return LANGS.includes(s) ? s : "it";
}

function todayStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: process.env.CLUB_TIMEZONE || "Europe/Rome" });
}

function isLive(a: any, today: string): boolean {
  const start = a.publishStart ? String(a.publishStart).slice(0, 10) : null;
  const end = a.publishEnd ? String(a.publishEnd).slice(0, 10) : null;
  if (start && today < start) return false;
  if (end && today > end) return false;
  return true;
}

async function translationMap(db: any): Promise<Record<string, Record<string, { title: string; body: string }>>> {
  const map: Record<string, Record<string, { title: string; body: string }>> = {};
  try {
    const rows = await db.select().from(announcementTranslations);
    for (const r of rows as any[]) {
      (map[String(r.announcementId)] ||= {})[String(r.lang)] = { title: r.title, body: r.body };
    }
  } catch {}
  return map;
}

// Resolve title/body for lang, falling back to the base copy.
function resolveItem(a: any, map: Record<string, Record<string, { title: string; body: string }>>, lang: string) {
  const t = (map[String(a.id)] || {})[lang];
  const { publishStart, publishEnd, ...rest } = a;
  return {
    ...rest,
    title: t?.title || a.title,
    body: t?.body || a.body,
    publish_start: publishStart ? String(publishStart).slice(0, 10) : null,
    publish_end: publishEnd ? String(publishEnd).slice(0, 10) : null,
  };
}

async function saveTranslations(db: any, id: string, translations: any) {
  if (!translations || typeof translations !== "object") return;
  for (const lang of LANGS) {
    const t = translations[lang];
    if (!t) continue;
    const title = String(t.title || "").trim();
    const body = String(t.body || "");
    if (!title) {
      await db.delete(announcementTranslations).where(and(eq(announcementTranslations.announcementId, id), eq(announcementTranslations.lang, lang)));
      continue;
    }
    await db.insert(announcementTranslations).values({ announcementId: id, lang, title, body }).onConflictDoUpdate({
      target: [announcementTranslations.announcementId, announcementTranslations.lang],
      set: { title, body },
    });
  }
}

export default async function announcementRoutes(fastify: FastifyInstance) {
  // Public feed: optional auth — members-only items included when logged in.
  // ?lang= resolves title/body, falling back to the base copy.
  fastify.get("/api/announcements", async (req, reply) => {
    const db: any = (fastify as any).db;
    if (!db) return reply.send([]);
    let authed = false;
    try {
      await (req as any).jwtVerify();
      authed = !!(req as any).user;
    } catch {}
    const lang = normalizeLang((req.query as any)?.lang);
    const today = todayStr();
    const rows = await db.select().from(announcements).orderBy(asc(announcements.position), desc(announcements.createdAt));
    const map = await translationMap(db);
    return reply.send(
      rows
        .filter((a: any) => isLive(a, today) && (a.visibility === "public" || authed))
        .map((a: any) => resolveItem(a, map, lang))
    );
  });

  // Admin: full list (including scheduled/expired) with all translations for the CRUD UI.
  fastify.get("/api/announcements/all", { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] }, async (req, reply) => {
    const db: any = (fastify as any).db;
    if (!db) return reply.send([]);
    const rows = await db.select().from(announcements).orderBy(asc(announcements.position), desc(announcements.createdAt));
    const map = await translationMap(db);
    return reply.send(rows.map((a: any) => ({ ...resolveItem(a, map, "it"), translations: map[String(a.id)] || {} })));
  });

  fastify.post("/api/announcements", { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] }, async (req, reply) => {
    const parsed = announcementSchema.safeParse((req as any).body);
    if (!parsed.success) return reply.status(400).send(parsed.error.flatten());
    const db: any = (fastify as any).db;
    if (!db) return reply.status(501).send({ error: "DB not configured" });
    const d = parsed.data as any;
    // New articles append at the end; admin promotes via reorder (up/down).
    let nextPos = 0;
    try {
      const { sql } = await import("drizzle-orm");
      const m = await db.select({ m: sql`max(${announcements.position})` }).from(announcements);
      nextPos = (Number(m[0]?.m) || 0) + 1;
    } catch {}
    const [row] = await db.insert(announcements).values({
      title: d.title,
      body: d.body,
      visibility: d.visibility ?? "public",
      position: nextPos,
      publishStart: d.publish_start ?? null,
      publishEnd: d.publish_end ?? null,
      createdBy: (req as any).user.id,
    }).returning();
    await saveTranslations(db, row.id, d.translations);
    return reply.status(201).send(row);
  });

  fastify.patch("/api/announcements/:id", { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] }, async (req, reply) => {
    const parsed = announcementPatchSchema.safeParse((req as any).body);
    if (!parsed.success) return reply.status(400).send(parsed.error.flatten());
    const db: any = (fastify as any).db;
    if (!db) return reply.status(501).send({ error: "DB not configured" });
    const d = parsed.data as any;
    const updates: any = { updatedAt: new Date() };
    if (d.title !== undefined) updates.title = d.title;
    if (d.body !== undefined) updates.body = d.body;
    if (d.visibility !== undefined) updates.visibility = d.visibility;
    if (d.publish_start !== undefined) updates.publishStart = d.publish_start ?? null;
    if (d.publish_end !== undefined) updates.publishEnd = d.publish_end ?? null;
    const [row] = await db.update(announcements).set(updates).where(eq(announcements.id, (req.params as any).id)).returning();
    if (!row) return reply.status(404).send({ error: "Not found" });
    await saveTranslations(db, row.id, d.translations);
    return reply.send(row);
  });

  // Admin priority order: full ordered id list → position = index.
  fastify.patch("/api/announcements/reorder", { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] }, async (req, reply) => {
    const ids = (req as any).body?.ordered_ids;
    if (!Array.isArray(ids) || ids.length === 0 || ids.some((id: any) => typeof id !== "string")) {
      return reply.status(400).send({ error: "ordered_ids must be a non-empty string array" });
    }
    const db: any = (fastify as any).db;
    if (!db) return reply.status(501).send({ error: "DB not configured" });
    for (let i = 0; i < ids.length; i++) {
      await db.update(announcements).set({ position: i, updatedAt: new Date() }).where(eq(announcements.id, ids[i]));
    }
    const rows = await db.select().from(announcements).orderBy(asc(announcements.position), desc(announcements.createdAt));
    return reply.send(rows);
  });

  fastify.delete("/api/announcements/:id", { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] }, async (req, reply) => {
    const db: any = (fastify as any).db;
    if (!db) return reply.status(501).send({ error: "DB not configured" });
    const rows = await db.delete(announcements).where(eq(announcements.id, (req.params as any).id)).returning();
    if (!rows[0]) return reply.status(404).send({ error: "Not found" });
    return reply.status(204).send();
  });
}
