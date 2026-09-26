import { BRAND_NAME } from "../config/brand.js";

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
  // Normalize "to": keep digits, strip leading 00/0 (Meta expects E.164 without +/00, e.g. 393923047417 not 00393...)
  let normalized = to.replace(/[^\d]/g, "");
  if (normalized.startsWith("00")) normalized = normalized.slice(2);
  else if (normalized.startsWith("0")) normalized = normalized.slice(1);
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

function bookingAdminUrl(bookingId: string, settings: any): string {
  const base = (settings?.publicUrl || process.env.FRONTEND_URL || process.env.PUBLIC_URL || process.env.CORS_ORIGIN || "https://empanadel.onrender.com").replace(/\/$/, "");
  return `${base}/#admin-bookings?highlight=${bookingId}`;
}

type Lang = "it" | "en" | "fr" | "de" | "es";
const LANGS: Lang[] = ["it","en","fr","de","es"];
function normalizeLang(v: any): Lang {
  const s = String(v || "it").toLowerCase();
  return (LANGS as string[]).includes(s) ? (s as Lang) : "it";
}
const NOTIF = {
  it: {
    adminPendingTitle: "Nuova prenotazione in attesa di approvazione",
    court: "Campo",
    when: "Quando",
    user: "Utente",
    notes: "Note",
    manage: (url: string) => `per gestire la prenotazione, clicca <a href="${url}">qui</a>`,
    managePlain: (url: string) => `per gestire la prenotazione, clicca qui: ${url}`,
    yourBookingWas: "La tua prenotazione è stata",
    status: "Stato",
    approved: "approvata",
    rejected: "rifiutata",
    dash: "—",
  },
  en: {
    adminPendingTitle: "New booking pending approval",
    court: "Court",
    when: "When",
    user: "User",
    notes: "Notes",
    manage: (url: string) => `to manage booking, click <a href="${url}">here</a>`,
    managePlain: (url: string) => `to manage booking, click here: ${url}`,
    yourBookingWas: "Your booking was",
    status: "Status",
    approved: "approved",
    rejected: "rejected",
    dash: "—",
  },
  fr: {
    adminPendingTitle: "Nouvelle réservation en attente d'approbation",
    court: "Terrain",
    when: "Quand",
    user: "Utilisateur",
    notes: "Notes",
    manage: (url: string) => `pour gérer la réservation, cliquez <a href="${url}">ici</a>`,
    managePlain: (url: string) => `pour gérer la réservation, cliquez ici : ${url}`,
    yourBookingWas: "Votre réservation a été",
    status: "Statut",
    approved: "approuvée",
    rejected: "rejetée",
    dash: "—",
  },
  de: {
    adminPendingTitle: "Neue Buchung ausstehend — Genehmigung erforderlich",
    court: "Platz",
    when: "Wann",
    user: "Nutzer",
    notes: "Notizen",
    manage: (url: string) => `um die Buchung zu verwalten, klicke <a href="${url}">hier</a>`,
    managePlain: (url: string) => `um die Buchung zu verwalten, klicke hier: ${url}`,
    yourBookingWas: "Deine Buchung wurde",
    status: "Status",
    approved: "genehmigt",
    rejected: "abgelehnt",
    dash: "—",
  },
  es: {
    adminPendingTitle: "Nueva reserva pendiente de aprobación",
    court: "Pista",
    when: "Cuándo",
    user: "Usuario",
    notes: "Notas",
    manage: (url: string) => `para gestionar la reserva, haz clic <a href="${url}">aquí</a>`,
    managePlain: (url: string) => `para gestionar la reserva, haz clic aquí: ${url}`,
    yourBookingWas: "Tu reserva fue",
    status: "Estado",
    approved: "aprobada",
    rejected: "rechazada",
    dash: "—",
  },
} as const;

function buildAdminPendingMessage(b: any, user: any, court: any, clubName: string, settings: any, lang: Lang): string {
  const T = NOTIF[normalizeLang(lang)];
  const courtLabel = court?.name ? `${court.name} · ${court.type}` : `Court #${court?.number ?? b.courtId?.slice(0, 6)}`;
  const when = `${b.date} ${String(b.startTime).slice(0, 5)}–${String(b.endTime).slice(0, 5)}`;
  const who = user ? `${user.username} (${user.firstName ?? ""} ${user.lastName ?? ""})`.trim() : b.userId;
  const rent = b.rentRacquets ? ` · ${b.rentRacquets} racquets` : "";
  const players = b.players ? ` · ${b.players} players` : "";
  const url = bookingAdminUrl(b.id, settings);
  return `🔔 <b>${clubName}</b> ${T.dash} ${T.adminPendingTitle}\n${T.court}: ${courtLabel}\n${T.when}: ${when}${players}${rent}\n${T.user}: ${who}\n${T.notes}: ${b.notes || "-"}\n${T.manage(url)}`;
}
function buildAdminPendingPlain(b: any, user: any, court: any, clubName: string, settings: any, lang: Lang): string {
  const T = NOTIF[normalizeLang(lang)];
  const courtLabel = court?.name ? `${court.name} · ${court.type}` : `Court #${court?.number ?? b.courtId?.slice(0, 6)}`;
  const when = `${b.date} ${String(b.startTime).slice(0, 5)}–${String(b.endTime).slice(0, 5)}`;
  const who = user ? `${user.username} (${user.firstName ?? ""} ${user.lastName ?? ""})`.trim() : b.userId;
  const rent = b.rentRacquets ? ` · ${b.rentRacquets} racquets` : "";
  const players = b.players ? ` · ${b.players} players` : "";
  const url = bookingAdminUrl(b.id, settings);
  return `🔔 ${clubName} ${T.dash} ${T.adminPendingTitle}\n${T.court}: ${courtLabel}\n${T.when}: ${when}${players}${rent}\n${T.user}: ${who}\n${T.notes}: ${b.notes || "-"}\n${T.managePlain(url)}`;
}

function buildUserDecisionMessage(b: any, court: any, clubName: string, decision: "approved" | "rejected", lang: Lang): string {
  const T = NOTIF[normalizeLang(lang)];
  const courtLabel = court?.name ? `${court.name} · ${court.type}` : `Court #${court?.number ?? b.courtId?.slice(0, 6)}`;
  const when = `${b.date} ${String(b.startTime).slice(0, 5)}–${String(b.endTime).slice(0, 5)}`;
  const icon = decision === "approved" ? "✅" : "❌";
  const verb = decision === "approved" ? T.approved : T.rejected;
  return `${icon} <b>${clubName}</b> ${T.dash} ${T.yourBookingWas} ${verb}\n${T.court}: ${courtLabel}\n${T.when}: ${when}\n${T.status}: ${verb}`;
}

export async function notifyAdminPendingBooking(db: Db, booking: any) {
  try {
    const settings = await getNotificationSettings(db);
    if (!settings || !settings.notificationsEnabled) return;
    // respect channel toggles
    const viaTelegram = (settings as any).notifyViaTelegram ?? true;
    const viaWhatsapp = (settings as any).notifyViaWhatsapp ?? true;
    const clubName = settings.clubName || BRAND_NAME;
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
    const telegramBotToken = settings.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || "";
    const telegramAdminChatId = settings.telegramAdminChatId || process.env.TELEGRAM_ADMIN_CHAT_ID || "";
    const whatsappToken = settings.whatsappToken || process.env.WHATSAPP_TOKEN || "";
    const whatsappPhoneNumberId = settings.whatsappPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || "";
    const whatsappAdminPhone = settings.whatsappAdminPhone || process.env.WHATSAPP_ADMIN_PHONE || "";

    // Telegram to admin(s) — per-recipient language
    // Union: manual telegramAdminChatId list + all linked admin users (users.role=admin AND telegramChatId set)
    // so admin can subscribe via Admin → Notifications → Connect Telegram just like regular users in Profile.
    if (viaTelegram && telegramBotToken && (telegramAdminChatId || true)) {
      const manualIds = telegramAdminChatId ? String(telegramAdminChatId).split(",").map((s: string) => s.trim()).filter(Boolean) : [];
      let linkedAdminIds: string[] = [];
      try {
        const adminRows = await db.select().from(users);
        linkedAdminIds = (adminRows as any[])
          .filter((u: any) => u.role === "admin" && u.telegramChatId)
          .map((u: any) => String(u.telegramChatId).trim())
          .filter(Boolean);
      } catch {}
      const chatIds = [...new Set([...manualIds, ...linkedAdminIds])];
      if (chatIds.length === 0) console.warn("[notify] no telegram admin recipients (manual list empty + no linked admins)");
      for (const chatId of chatIds) {
        let lang: Lang = "it";
        try {
          const aRows = await db.select().from(users).where(eq(users.telegramChatId, chatId)).limit(1);
          if (aRows[0]?.preferredLanguage) lang = normalizeLang(aRows[0].preferredLanguage);
        } catch {}
        const text = buildAdminPendingMessage(booking, user, court, clubName, settings, lang);
        sendTelegramMessage(telegramBotToken, chatId, text).catch(() => {});
      }
    }
    // WhatsApp to admin phone (single) — per-recipient language via mobile lookup
    if (viaWhatsapp && whatsappToken && whatsappPhoneNumberId && whatsappAdminPhone) {
      let lang: Lang = "it";
      try {
        let norm = whatsappAdminPhone.replace(/[^\d]/g,"");
        if (norm.startsWith("00")) norm = norm.slice(2); else if (norm.startsWith("0")) norm = norm.slice(1);
        const aRows = await db.select().from(users).where(eq(users.mobile, norm)).limit(1);
        if (!aRows[0]) {
          const all = await db.select().from(users);
          const found = (all as any[]).find((u:any)=> {
            let m = String(u.mobile||"").replace(/[^\d]/g,"");
            if (m.startsWith("00")) m=m.slice(2); else if (m.startsWith("0")) m=m.slice(1);
            return m===norm;
          });
          if (found?.preferredLanguage) lang = normalizeLang(found.preferredLanguage);
        } else if (aRows[0]?.preferredLanguage) lang = normalizeLang(aRows[0].preferredLanguage);
      } catch {}
      const waText = buildAdminPendingPlain(booking, user, court, clubName, settings, lang);
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
    if (decision === "approved" && (settings as any).notifyOnApproval === false) return;
    if (decision === "rejected" && (settings as any).notifyOnRejection === false) return;
    const viaTelegram = (settings as any).notifyViaTelegram ?? true;
    const viaWhatsapp = (settings as any).notifyViaWhatsapp ?? true;
    const clubName = settings.clubName || BRAND_NAME;
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
    const lang = normalizeLang(user?.preferredLanguage || user?.preferred_language || "it");
    const text = buildUserDecisionMessage(booking, court, clubName, decision, lang);
    const waText = text.replace(/<[^>]*>/g, "");
    const telegramBotToken = settings.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || "";
    const whatsappToken = settings.whatsappToken || process.env.WHATSAPP_TOKEN || "";
    const whatsappPhoneNumberId = settings.whatsappPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || "";

    const promises: Promise<boolean>[] = [];
    if (viaTelegram && user?.telegramChatId && telegramBotToken) {
      promises.push(sendTelegramMessage(telegramBotToken, user.telegramChatId, text));
    }
    if (viaWhatsapp && user?.mobile && whatsappToken && whatsappPhoneNumberId) {
      promises.push(sendWhatsAppMessage(whatsappPhoneNumberId, whatsappToken, user.mobile, waText));
    }
    if (promises.length === 0) {
      console.warn(`[notify] user ${booking.userId} has no telegramChatId/mobile or channels disabled — no channel to notify for ${decision}`);
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
    public_url: s.publicUrl || "https://empanadel.onrender.com",
    notifications_enabled: s.notificationsEnabled,
    notify_on_auto_approved: s.notifyOnAutoApproved ?? false,
    notify_on_approval: s.notifyOnApproval ?? true,
    notify_on_rejection: s.notifyOnRejection ?? true,
    notify_via_telegram: s.notifyViaTelegram ?? true,
    notify_via_whatsapp: s.notifyViaWhatsapp ?? true,
    telegram_bot_token: s.telegramBotToken ? maskToken(s.telegramBotToken) : null,
    telegram_bot_token_present: !!s.telegramBotToken,
    telegram_admin_chat_id: s.telegramAdminChatId,
    whatsapp_token_present: !!s.whatsappToken,
    whatsapp_phone_number_id: s.whatsappPhoneNumberId,
    whatsapp_admin_phone: s.whatsappAdminPhone,
  };
}
