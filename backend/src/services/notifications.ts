type Db = any;

function maskToken(v: string | null | undefined): string | null {
  if (!v) return null;
  if (v.length <= 8) return "***";
  return v.slice(0, 4) + "***" + v.slice(-4);
}

export async function getNotificationSettings(db: Db) {
  if (!db) return null;
  try {
    const { appSettings } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");
    const rows = await db.select().from(appSettings).where(eq(appSettings.id, 1));
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function sendTelegramMessage(botToken: string, chatId: string, text: string): Promise<boolean> {
  if (!botToken || !chatId) return false;
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[notify] telegram failed ${res.status} ${body.slice(0, 300)}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[notify] telegram error", e);
    return false;
  }
}

export async function sendWhatsAppMessage(phoneNumberId: string, token: string, to: string, text: string): Promise<boolean> {
  if (!phoneNumberId || !token || !to) return false;
  // Normalize "to": keep digits and +, Meta expects E.164 without +? Both work, send without + prefix but with country code
  const normalized = to.replace(/[^\d]/g, "");
  if (!normalized) return false;
  try {
    const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: normalized,
        type: "text",
        text: { preview_url: false, body: text },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[notify] whatsapp failed ${res.status} ${body.slice(0, 500)}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[notify] whatsapp error", e);
    return false;
  }
}

function buildAdminPendingMessage(b: any, user: any, court: any, clubName: string): string {
  const courtLabel = court?.name ? `${court.name} · ${court.type}` : `Court #${court?.number ?? b.courtId?.slice(0, 6)}`;
  const when = `${b.date} ${String(b.startTime).slice(0, 5)}–${String(b.endTime).slice(0, 5)}`;
  const who = user ? `${user.username} (${user.firstName ?? ""} ${user.lastName ?? ""})`.trim() : b.userId;
  const rent = b.rentRacquets ? ` · ${b.rentRacquets} racquets` : "";
  const players = b.players ? ` · ${b.players} players` : "";
  return `🔔 <b>${clubName}</b> — New booking pending approval\nCourt: ${courtLabel}\nWhen: ${when}${players}${rent}\nUser: ${who}\nNotes: ${b.notes || "-"}\nBooking ID: ${b.id}`;
}

function buildUserDecisionMessage(b: any, court: any, clubName: string, decision: "approved" | "rejected"): string {
  const courtLabel = court?.name ? `${court.name} · ${court.type}` : `Court #${court?.number ?? b.courtId?.slice(0, 6)}`;
  const when = `${b.date} ${String(b.startTime).slice(0, 5)}–${String(b.endTime).slice(0, 5)}`;
  const icon = decision === "approved" ? "✅" : "❌";
  const verb = decision === "approved" ? "approved" : "rejected";
  return `${icon} <b>${clubName}</b> — Your booking was ${verb}\nCourt: ${courtLabel}\nWhen: ${when}\nStatus: ${decision}\nBooking ID: ${b.id}`;
}

export async function notifyAdminPendingBooking(db: Db, booking: any) {
  try {
    const settings = await getNotificationSettings(db);
    if (!settings || !settings.notificationsEnabled) return;
    const clubName = settings.clubName || "Empanadel";
    const { users, courts } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");
    let user: any = null;
    let court: any = null;
    try {
      const uRows = await db.select().from(users).where(eq(users.id, booking.userId)).limit(1);
      user = uRows[0] ?? null;
    } catch {}
    try {
      const cRows = await db.select().from(courts).where(eq(courts.id, booking.courtId)).limit(1);
      court = cRows[0] ?? null;
    } catch {}
    const text = buildAdminPendingMessage(booking, user, court, clubName);

    const telegramBotToken = settings.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || "";
    const telegramAdminChatId = settings.telegramAdminChatId || process.env.TELEGRAM_ADMIN_CHAT_ID || "";
    const whatsappToken = settings.whatsappToken || process.env.WHATSAPP_TOKEN || "";
    const whatsappPhoneNumberId = settings.whatsappPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || "";
    const whatsappAdminPhone = settings.whatsappAdminPhone || process.env.WHATSAPP_ADMIN_PHONE || "";

    // Telegram to admin(s) — comma separated chat ids
    if (telegramBotToken && telegramAdminChatId) {
      const chatIds = String(telegramAdminChatId).split(",").map((s: string) => s.trim()).filter(Boolean);
      for (const chatId of chatIds) {
        // fire-and-forget per chat, don't await sequentially failing
        sendTelegramMessage(telegramBotToken, chatId, text).catch(() => {});
      }
    }
    // WhatsApp to admin phone (single)
    if (whatsappToken && whatsappPhoneNumberId && whatsappAdminPhone) {
      const waText = text.replace(/<[^>]*>/g, ""); // strip HTML for WhatsApp
      sendWhatsAppMessage(whatsappPhoneNumberId, whatsappToken, whatsappAdminPhone, waText).catch(() => {});
    }
  } catch (e) {
    console.warn("[notify] notifyAdminPendingBooking error", e);
  }
}

export async function notifyUserBookingDecision(db: Db, booking: any, decision: "approved" | "rejected") {
  try {
    const settings = await getNotificationSettings(db);
    if (!settings || !settings.notificationsEnabled) return;
    const clubName = settings.clubName || "Empanadel";
    const { users, courts } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");
    let user: any = null;
    let court: any = null;
    try {
      const uRows = await db.select().from(users).where(eq(users.id, booking.userId)).limit(1);
      user = uRows[0] ?? null;
    } catch {}
    try {
      const cRows = await db.select().from(courts).where(eq(courts.id, booking.courtId)).limit(1);
      court = cRows[0] ?? null;
    } catch {}
    const text = buildUserDecisionMessage(booking, court, clubName, decision);
    const waText = text.replace(/<[^>]*>/g, "");
    const telegramBotToken = settings.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || "";
    const whatsappToken = settings.whatsappToken || process.env.WHATSAPP_TOKEN || "";
    const whatsappPhoneNumberId = settings.whatsappPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || "";

    // Prefer user-specific channels if present
    const promises: Promise<boolean>[] = [];
    if (user?.telegramChatId && telegramBotToken) {
      promises.push(sendTelegramMessage(telegramBotToken, user.telegramChatId, text));
    }
    if (user?.mobile && whatsappToken && whatsappPhoneNumberId) {
      promises.push(sendWhatsAppMessage(whatsappPhoneNumberId, whatsappToken, user.mobile, waText));
    }
    // If user has no contact channels, optionally fallback to no-op (could log)
    if (promises.length === 0) {
      console.warn(`[notify] user ${booking.userId} has no telegramChatId/mobile — no channel to notify for ${decision}`);
      return;
    }
    await Promise.allSettled(promises);
  } catch (e) {
    console.warn("[notify] notifyUserBookingDecision error", e);
  }
}

export function maskSettingsForAdminResponse(s: any) {
  if (!s) return s;
  return {
    default_slot_duration_minutes: s.defaultSlotDurationMinutes,
    booking_hold_minutes: s.bookingHoldMinutes,
    max_advance_days: s.maxAdvanceDays,
    min_cancel_hours: s.minCancelHours,
    auto_approve_bookings: s.autoApproveBookings,
    club_name: s.clubName,
    club_phone: s.clubPhone,
    club_address: s.clubAddress,
    notifications_enabled: s.notificationsEnabled,
    telegram_bot_token: s.telegramBotToken ? maskToken(s.telegramBotToken) : null,
    telegram_bot_token_present: !!s.telegramBotToken,
    telegram_admin_chat_id: s.telegramAdminChatId,
    whatsapp_token_present: !!s.whatsappToken,
    whatsapp_phone_number_id: s.whatsappPhoneNumberId,
    whatsapp_admin_phone: s.whatsappAdminPhone,
  };
}
