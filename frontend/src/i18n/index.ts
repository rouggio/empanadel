export type Lang = "it" | "en" | "fr" | "de" | "es";

import it from "./it.json";
import en from "./en.json";
import fr from "./fr.json";
import de from "./de.json";
import es from "./es.json";

const catalog: Record<Lang, Record<string, string>> = { it, en, fr, de, es };

const STORAGE = "lang";

export function detectLang(): Lang {
  const stored = localStorage.getItem(STORAGE) as Lang | null;
  if (stored && catalog[stored]) return stored;
  const nav = navigator.language.slice(0, 2).toLowerCase() as Lang;
  if (catalog[nav]) return nav;
  return "it";
}

export function setLang(lang: Lang) {
  localStorage.setItem(STORAGE, lang);
  document.documentElement.lang = lang;
}

export function t(lang: Lang, key: string, fallback?: string): string {
  return catalog[lang]?.[key] ?? catalog["en"]?.[key] ?? fallback ?? key;
}

export { catalog };
