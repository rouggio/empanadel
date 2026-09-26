// Single source of truth for the product brand name (frontend).
// Rename the project by setting VITE_BRAND_NAME env (or editing the fallback
// below) — `t('app.name')` in `i18n/index.ts` returns this, so every
// `x-text="t('app.name')"` in the UI updates at once.
export const BRAND_NAME =
  ((import.meta as any).env?.VITE_BRAND_NAME as string | undefined) ||
  "Bagel Club";
