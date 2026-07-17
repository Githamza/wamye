// ============================================================
// The locales the app ships in.
//
// Imported by proxy.ts, which runs before React exists — so this file must
// stay free of next-intl, React and server-only imports. It is the one place
// that knows the locale set; everything else derives from it.
// ============================================================

/**
 * French, and Tunisian Arabic — derja, not MSA.
 *
 * The region subtag earns its keep: ICU gives "ar-TN" Western digits (1.234,5)
 * where plain "ar" or "ar-EG" would give Arabic-Indic (١٬٢٣٤٫٥), and Maghrebi
 * month names ("جويلية", from the French juillet) rather than MSA's "يوليو".
 */
export const LOCALES = ["fr", "ar-TN"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "fr";

/** Narrows an unknown path segment — [lang] catches every unmatched URL. */
export function hasLocale(value: string | null | undefined): value is Locale {
  return value != null && (LOCALES as readonly string[]).includes(value);
}

/** Only derja reads right-to-left. */
export function dirOf(locale: Locale): "ltr" | "rtl" {
  return locale === "ar-TN" ? "rtl" : "ltr";
}

/**
 * Remembers a reader's choice across visits, so landing on "/" a second time
 * does not fall back to guessing from Accept-Language.
 */
export const LOCALE_COOKIE = "wamye_locale";
