// ============================================================
// next-intl's per-request configuration, discovered automatically by
// createNextIntlPlugin (it looks for ./src/i18n/request.ts).
//
// `requestLocale` resolves from setRequestLocale(), which app/[lang]/layout.tsx
// calls. next-intl would normally set it from a header in its own middleware,
// but this app hand-rolls locale routing in proxy.ts — the two routing models
// would fight, and ours has to coexist with Supabase auth on the same file.
// ============================================================

import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, hasLocale } from "@/i18n/locales";

export default getRequestConfig(async ({ requestLocale }) => {
  // Two ways this is not a valid locale, both expected:
  //   - undefined, for the French-only routes outside the [lang] segment.
  //   - junk, because [lang] catches every unmatched URL (e.g. /robots.txt).
  const requested = await requestLocale;
  const locale = hasLocale(requested) ? requested : DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
