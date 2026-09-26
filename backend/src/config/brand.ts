// Single source of truth for the product brand name (backend).
// Rename the project by setting env BRAND_NAME — no code edits needed.
export const BRAND_NAME = process.env.BRAND_NAME || "Bagel Club";

// Fallback Telegram bot username used for deep links when no bot token is configured.
export const TELEGRAM_BOT_USERNAME_FALLBACK =
  process.env.TELEGRAM_BOT_USERNAME || "Empanadel_bot";
