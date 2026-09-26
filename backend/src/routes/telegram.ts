import type { FastifyInstance } from "fastify";
import { users, telegramLinkTokens } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { sendTelegramMessage } from "../services/notifications.js";
import { BRAND_NAME, TELEGRAM_BOT_USERNAME_FALLBACK } from "../config/brand.js";

async function getBotUsername(botToken: string): Promise<string> {
  if (!botToken) return TELEGRAM_BOT_USERNAME_FALLBACK;
  try {
    const r = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const j: any = await r.json().catch(() => null);
    if (j?.ok && j.result?.username) return j.result.username;
  } catch {}
  return TELEGRAM_BOT_USERNAME_FALLBACK;
}

export default async function telegramRoutes(fastify: FastifyInstance) {
  // POST /api/telegram/link -> create short token and return deep link
  fastify.post("/api/telegram/link", { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const db: any = (fastify as any).db;
    if (!db) return reply.status(501).send({ error: "DB not configured" });
    const user = (req as any).user;
    // get settings for bot token to build link
    let botToken = process.env.TELEGRAM_BOT_TOKEN || "";
    try {
      const { appSettings } = await import("../db/schema.js");
      const rows = await db.select().from(appSettings).where(eq(appSettings.id, 1));
      if (rows[0]?.telegramBotToken) botToken = rows[0].telegramBotToken;
    } catch {}
    const username = await getBotUsername(botToken);
    const token = randomBytes(16).toString("hex"); // 32 chars
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    try {
      await db.insert(telegramLinkTokens).values({ token, userId: user.id, expiresAt });
    } catch (e: any) {
      return reply.status(500).send({ error: "Could not create link" });
    }
    // cleanup expired tokens
    try { await db.delete(telegramLinkTokens).where(eq(telegramLinkTokens.expiresAt, new Date(0))); } catch {}
    const url = `https://t.me/${username}?start=${token}`;
    return reply.send({ url, token, username, expires_at: expiresAt.toISOString() });
  });

  // GET /api/telegram/status -> whether linked
  fastify.get("/api/telegram/status", { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const db: any = (fastify as any).db;
    if (!db) return reply.send({ linked: false });
    const user = (req as any).user;
    const rows = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    const linked = !!rows[0]?.telegramChatId;
    return reply.send({ linked, telegram_chat_id: linked ? String(rows[0].telegramChatId) : null });
  });

  // POST /api/telegram/unlink
  fastify.post("/api/telegram/unlink", { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const db: any = (fastify as any).db;
    if (!db) return reply.send({ ok: true });
    const user = (req as any).user;
    await db.update(users).set({ telegramChatId: null } as any).where(eq(users.id, user.id));
    return reply.send({ ok: true, linked: false });
  });

  // POST /api/telegram/webhook -> Telegram calls this when user sends /start
  fastify.post("/api/telegram/webhook", async (req, reply) => {
    const db: any = (fastify as any).db;
    const body: any = (req as any).body;
    // Telegram update structure: { message: { chat: {id}, text: "/start <token>" } }
    const message = body?.message || body?.edited_message;
    if (!message?.chat?.id || !message?.text) {
      return reply.send({ ok: true });
    }
    const chatId = String(message.chat.id);
    const text: string = String(message.text).trim();
    // only handle /start <token>
    const m = text.match(/^\/start\s+([a-f0-9]{32})/i);
    if (!m) {
      // For plain /start without token, send help
      if (text === "/start") {
        let botToken = process.env.TELEGRAM_BOT_TOKEN || "";
        try {
          if (db) {
            const { appSettings } = await import("../db/schema.js");
            const rows = await db.select().from(appSettings).where(eq(appSettings.id, 1));
            if (rows[0]?.telegramBotToken) botToken = rows[0].telegramBotToken;
          }
        } catch {}
        if (botToken) {
          await sendTelegramMessage(botToken, chatId, `Hi! To link your ${BRAND_NAME} account, open your Profile in the app and tap "Connect Telegram" — it will bring you here with a code.`);
        }
      }
      return reply.send({ ok: true });
    }
    const token = m[1].toLowerCase();
    if (!db) return reply.send({ ok: true });
    // find token
    const rows = await db.select().from(telegramLinkTokens).where(eq(telegramLinkTokens.token, token)).limit(1);
    const link = rows[0];
    if (!link) {
      // expired or invalid
      let botToken = process.env.TELEGRAM_BOT_TOKEN || "";
      try {
        const { appSettings } = await import("../db/schema.js");
        const r2 = await db.select().from(appSettings).where(eq(appSettings.id, 1));
        if (r2[0]?.telegramBotToken) botToken = r2[0].telegramBotToken;
      } catch {}
      if (botToken) await sendTelegramMessage(botToken, chatId, "Link expired or invalid. Please generate a new link from your Profile → Connect Telegram.");
      return reply.send({ ok: true });
    }
    if (new Date(link.expiresAt) < new Date()) {
      await db.delete(telegramLinkTokens).where(eq(telegramLinkTokens.token, token));
      let botToken = process.env.TELEGRAM_BOT_TOKEN || "";
      try {
        const { appSettings } = await import("../db/schema.js");
        const r2 = await db.select().from(appSettings).where(eq(appSettings.id, 1));
        if (r2[0]?.telegramBotToken) botToken = r2[0].telegramBotToken;
      } catch {}
      if (botToken) await sendTelegramMessage(botToken, chatId, "Link expired. Please generate a new one from your Profile.");
      return reply.send({ ok: true });
    }
    // link user
    await db.update(users).set({ telegramChatId: chatId } as any).where(eq(users.id, link.userId));
    await db.delete(telegramLinkTokens).where(eq(telegramLinkTokens.token, token));
    // confirm
    let botToken = process.env.TELEGRAM_BOT_TOKEN || "";
    try {
      const { appSettings } = await import("../db/schema.js");
      const r2 = await db.select().from(appSettings).where(eq(appSettings.id, 1));
      if (r2[0]?.telegramBotToken) botToken = r2[0].telegramBotToken;
    } catch {}
    if (botToken) await sendTelegramMessage(botToken, chatId, `✅ Telegram linked to your ${BRAND_NAME} account! You'll receive booking approvals/rejections here.`);
    return reply.send({ ok: true });
  });
}
