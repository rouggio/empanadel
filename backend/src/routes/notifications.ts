import type { FastifyInstance } from "fastify";
import { appSettings } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { sendTelegramMessage, sendWhatsAppMessage } from "../services/notifications.js";

export default async function notificationRoutes(fastify: FastifyInstance) {
  fastify.post("/api/notifications/test", { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] }, async (req, reply) => {
    const db: any = (fastify as any).db;
    const { channel, to } = (req as any).body as any; // channel: 'telegram' | 'whatsapp', to optional override
    const rows = db ? await db.select().from(appSettings).where(eq(appSettings.id, 1)) : [];
    const s = rows[0];
    const telegramBotToken = s?.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || "";
    const telegramAdminChatId = to || s?.telegramAdminChatId || process.env.TELEGRAM_ADMIN_CHAT_ID || "";
    const whatsappToken = s?.whatsappToken || process.env.WHATSAPP_TOKEN || "";
    const whatsappPhoneNumberId = s?.whatsappPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || "";
    const whatsappAdminPhone = to || s?.whatsappAdminPhone || process.env.WHATSAPP_ADMIN_PHONE || "";
    const clubName = s?.clubName || "Empanadel";
    const text = `🔔 ${clubName} — Test notification from Empanadel (${new Date().toISOString()})`;

    let result: any = {};
    if (!channel || channel === "telegram") {
      if (!telegramBotToken || !telegramAdminChatId) {
        result.telegram = { ok: false, error: "Missing telegram_bot_token or telegram_admin_chat_id (settings or env TELEGRAM_BOT_TOKEN/TELEGRAM_ADMIN_CHAT_ID)" };
      } else {
        const chatIds = String(telegramAdminChatId).split(",").map((v: string) => v.trim()).filter(Boolean);
        const outs: any[] = [];
        for (const cid of chatIds) {
          const ok = await sendTelegramMessage(telegramBotToken, cid, text);
          outs.push({ chatId: cid, ok });
        }
        result.telegram = outs;
      }
    }
    if (!channel || channel === "whatsapp") {
      if (!whatsappToken || !whatsappPhoneNumberId || !whatsappAdminPhone) {
        result.whatsapp = { ok: false, error: "Missing whatsapp_token / phone_number_id / admin_phone (settings or env WHATSAPP_TOKEN/WHATSAPP_PHONE_NUMBER_ID/WHATSAPP_ADMIN_PHONE)" };
      } else {
        const waText = text.replace(/<[^>]*>/g, "");
        const ok = await sendWhatsAppMessage(whatsappPhoneNumberId, whatsappToken, whatsappAdminPhone, waText);
        result.whatsapp = { to: whatsappAdminPhone, ok };
      }
    }
    return reply.send(result);
  });
}
