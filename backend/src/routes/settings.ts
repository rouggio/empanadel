import type { FastifyInstance } from "fastify";
import { settingsSchema } from "../types/schemas.js";
import { appSettings } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { maskSettingsForAdminResponse } from "../services/notifications.js";

export default async function settingsRoutes(fastify: FastifyInstance) {
  // Public club info for footer (no auth)
  fastify.get("/api/club-info", async (_req, reply) => {
    const db: any = (_req as any).server.db ?? (_req as any).db;
    if (!db) return reply.send({ club_name: "Green Village", club_phone: "3923047417", club_address: "" });
    try {
      const rows = await db.select().from(appSettings).where(eq(appSettings.id, 1));
      const s = rows[0];
      if (!s) return reply.send({ club_name: "Green Village", club_phone: "3923047417", club_address: "" });
      return reply.send({ club_name: s.clubName || "Green Village", club_phone: s.clubPhone || "3923047417", club_address: s.clubAddress || "" });
    } catch {
      return reply.send({ club_name: "Green Village", club_phone: "3923047417", club_address: "" });
    }
  });

  fastify.get("/api/settings", { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] }, async (_req, reply) => {
    const db: any = (_req as any).server.db;
    if (!db) {
      return reply.send({
        default_slot_duration_minutes: 60,
        booking_hold_minutes: 30,
        max_advance_days: 14,
        min_cancel_hours: 2,
        auto_approve_bookings: false,
        club_name: "Green Village",
        club_phone: "3923047417",
        club_address: "",
        public_url: "https://empanadel.onrender.com",
        notifications_enabled: false,
        notify_on_auto_approved: false,
        notify_via_telegram: true,
        notify_via_whatsapp: true,
      });
    }
    const rows = await db.select().from(appSettings).where(eq(appSettings.id, 1));
    const s = rows[0];
    if (!s) return reply.send({ default_slot_duration_minutes: 60, booking_hold_minutes: 30, max_advance_days: 14, min_cancel_hours: 2, auto_approve_bookings: false, club_name: "Green Village", club_phone: "3923047417", club_address: "", public_url: "https://empanadel.onrender.com", notifications_enabled: false, notify_on_auto_approved: false, notify_via_telegram: true, notify_via_whatsapp: true });
    return reply.send(maskSettingsForAdminResponse(s));
  });

  fastify.put("/api/settings", { preHandler: [fastify.authenticate, fastify.requireRole(["admin"])] }, async (req, reply) => {
    const parsed = settingsSchema.safeParse((req as any).body);
    if (!parsed.success) return reply.status(400).send(parsed.error.flatten());
    const db: any = (fastify as any).db;
    if (!db) return reply.status(501).send({ error: "DB not configured" });
    const updates: any = {};
    if (parsed.data.default_slot_duration_minutes !== undefined) updates.defaultSlotDurationMinutes = parsed.data.default_slot_duration_minutes;
    if (parsed.data.booking_hold_minutes !== undefined) updates.bookingHoldMinutes = parsed.data.booking_hold_minutes;
    if (parsed.data.max_advance_days !== undefined) updates.maxAdvanceDays = parsed.data.max_advance_days;
    if (parsed.data.min_cancel_hours !== undefined) updates.minCancelHours = parsed.data.min_cancel_hours;
    if (parsed.data.auto_approve_bookings !== undefined) updates.autoApproveBookings = parsed.data.auto_approve_bookings;
    if (parsed.data.club_name !== undefined) updates.clubName = parsed.data.club_name || null;
    if (parsed.data.club_phone !== undefined) updates.clubPhone = parsed.data.club_phone || null;
    if (parsed.data.club_address !== undefined) updates.clubAddress = parsed.data.club_address || null;
    if (parsed.data.public_url !== undefined) updates.publicUrl = parsed.data.public_url ? parsed.data.public_url.replace(/\/$/, "") : null;
    if (parsed.data.notifications_enabled !== undefined) updates.notificationsEnabled = parsed.data.notifications_enabled;
    if (parsed.data.notify_on_auto_approved !== undefined) updates.notifyOnAutoApproved = parsed.data.notify_on_auto_approved;
    if (parsed.data.notify_via_telegram !== undefined) updates.notifyViaTelegram = parsed.data.notify_via_telegram;
    if (parsed.data.notify_via_whatsapp !== undefined) updates.notifyViaWhatsapp = parsed.data.notify_via_whatsapp;
    // Tokens: if masked value (contains ***) or same as present, ignore to avoid overwriting with masked placeholder
    if (parsed.data.telegram_bot_token !== undefined) {
      const v = parsed.data.telegram_bot_token;
      if (v && v.includes("***")) { /* keep existing */ } else updates.telegramBotToken = v || null;
    }
    if (parsed.data.telegram_admin_chat_id !== undefined) updates.telegramAdminChatId = parsed.data.telegram_admin_chat_id || null;
    if (parsed.data.whatsapp_token !== undefined) {
      const v = parsed.data.whatsapp_token;
      if (v && v.includes("***")) { /* keep existing */ } else updates.whatsappToken = v || null;
    }
    if (parsed.data.whatsapp_phone_number_id !== undefined) updates.whatsappPhoneNumberId = parsed.data.whatsapp_phone_number_id ? String(parsed.data.whatsapp_phone_number_id).replace(/[^\d]/g,"") : null;
    if (parsed.data.whatsapp_admin_phone !== undefined) {
      let v: string | null = parsed.data.whatsapp_admin_phone ? String(parsed.data.whatsapp_admin_phone).replace(/[^\d]/g,"") : null;
      if (v?.startsWith("00")) v = v.slice(2);
      else if (v?.startsWith("0")) v = v.slice(1);
      updates.whatsappAdminPhone = v || null;
    }
    updates.updatedAt = new Date();
    const [row] = await db.update(appSettings).set(updates).where(eq(appSettings.id, 1)).returning();
    return reply.send(maskSettingsForAdminResponse(row));
  });
}
