import { pgTable, uuid, text, varchar, integer, smallint, boolean, timestamp, date, time, pgEnum, index, unique } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["visitor", "associate", "admin"]);
export const courtTypeEnum = pgEnum("court_type", ["tennis", "padel"]);
export const bookingStatusEnum = pgEnum("booking_status", [
  "pending_registration",
  "pending_approval",
  "approved",
  "rejected",
  "cancelled",
  "expired",
]);
export const preferredLanguageEnum = pgEnum("preferred_language", ["it", "en", "fr", "de", "es"]);
export const genderEnum = pgEnum("gender", ["male", "female", "other", "prefer_not_to_say"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: varchar("username", { length: 30 }).notNull().unique(),
  email: varchar("email", { length: 255 }).unique(),
  passwordHash: text("password_hash").notNull(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  role: userRoleEnum("role").notNull().default("visitor"),
  preferredLanguage: preferredLanguageEnum("preferred_language").notNull().default("it"),
  preferredSport: courtTypeEnum("preferred_sport"),
  mobile: varchar("mobile", { length: 20 }),
  telegramChatId: varchar("telegram_chat_id", { length: 100 }),
  gender: genderEnum("gender"),
  birthdate: date("birthdate"),
  isVerified: boolean("is_verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const courts = pgTable("courts", {
  id: uuid("id").primaryKey().defaultRandom(),
  number: integer("number").notNull().unique(),
  type: courtTypeEnum("type").notNull(),
  name: varchar("name", { length: 100 }),
  surface: varchar("surface", { length: 50 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const timetables = pgTable(
  "timetables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courtId: uuid("court_id").references(() => courts.id, { onDelete: "cascade" }),
    dayOfWeek: smallint("day_of_week").notNull(),
    openTime: time("open_time"),
    closeTime: time("close_time"),
    slotDurationMinutes: integer("slot_duration_minutes").notNull().default(60),
    isClosed: boolean("is_closed").notNull().default(false),
  },
  (t) => [unique("timetables_court_day_unique").on(t.courtId, t.dayOfWeek)]
);

export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courtId: uuid("court_id")
      .notNull()
      .references(() => courts.id),
    userId: uuid("user_id").references(() => users.id),
    date: date("date").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    status: bookingStatusEnum("status").notNull(),
    notes: text("notes"),
    rentRacquets: integer("rent_racquets").notNull().default(0),
    players: integer("players").notNull().default(2),
    guestToken: varchar("guest_token", { length: 64 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("bookings_court_date_idx").on(t.courtId, t.date),
    index("bookings_status_idx").on(t.status),
    index("bookings_guest_token_idx").on(t.guestToken),
  ]
);

export const blocks = pgTable(
  "blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courtId: uuid("court_id").references(() => courts.id, { onDelete: "cascade" }),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    reason: text("reason").notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("blocks_start_end_idx").on(t.startAt, t.endAt)]
);

export const blockingRules = pgTable("blocking_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  courtId: uuid("court_id").references(() => courts.id, { onDelete: "cascade" }),
  dayOfWeek: smallint("day_of_week").notNull(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  reason: text("reason").notNull(),
  validFrom: date("valid_from"),
  validUntil: date("valid_until"),
  isActive: boolean("is_active").notNull().default(true),
});

export const appSettings = pgTable("app_settings", {
  id: smallint("id").primaryKey().default(1),
  defaultSlotDurationMinutes: integer("default_slot_duration_minutes").notNull().default(60),
  bookingHoldMinutes: integer("booking_hold_minutes").notNull().default(30),
  maxAdvanceDays: integer("max_advance_days").notNull().default(14),
  minCancelHours: integer("min_cancel_hours").notNull().default(2),
  autoApproveBookings: boolean("auto_approve_bookings").notNull().default(false),
  clubName: varchar("club_name", { length: 100 }),
  clubPhone: varchar("club_phone", { length: 30 }),
  clubAddress: varchar("club_address", { length: 200 }),
  publicUrl: varchar("public_url", { length: 255 }),
  notificationsEnabled: boolean("notifications_enabled").notNull().default(false),
  notifyOnAutoApproved: boolean("notify_on_auto_approved").notNull().default(false),
  notifyOnApproval: boolean("notify_on_approval").notNull().default(true),
  notifyOnRejection: boolean("notify_on_rejection").notNull().default(true),
  notifyViaTelegram: boolean("notify_via_telegram").notNull().default(true),
  notifyViaWhatsapp: boolean("notify_via_whatsapp").notNull().default(true),
  telegramBotToken: text("telegram_bot_token"),
  telegramAdminChatId: varchar("telegram_admin_chat_id", { length: 255 }),
  whatsappToken: text("whatsapp_token"),
  whatsappPhoneNumberId: varchar("whatsapp_phone_number_id", { length: 50 }),
  whatsappAdminPhone: varchar("whatsapp_admin_phone", { length: 30 }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id").references(() => users.id),
  action: varchar("action", { length: 50 }).notNull(),
  target: varchar("target", { length: 100 }).notNull(),
  meta: text("meta"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const telegramLinkTokens = pgTable("telegram_link_tokens", {
  token: varchar("token", { length: 64 }).primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
