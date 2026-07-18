// ============================================================
// Resolves the language for the (app) group — the driver dashboard, admin and
// the auth pages, whose URLs carry no locale segment.
//
// Server-only: reads the signed-in profile and the cookie. Kept out of
// i18n/locales.ts because that file must stay importable by proxy.ts, which
// runs before React and cannot pull in next/headers or the DAL.
// ============================================================

import "server-only";
import { cookies } from "next/headers";
import { getProfile } from "@/lib/auth/dal";
import { DEFAULT_LOCALE, LOCALE_COOKIE, hasLocale, type Locale } from "@/i18n/locales";

/**
 * The language to render in, in order of authority:
 *
 *   1. the signed-in driver's saved preference;
 *   2. the cookie, for /login and /signup — there is no profile to read yet,
 *      and someone who just browsed a shop in derja should not be handed a
 *      French sign-in form;
 *   3. French.
 *
 * getProfile is memoized per render, so callers that already read the profile
 * (the layout, require* guards) pay for this once. Both the (app) layout and
 * each page that translates must call it: next-intl resolves getTranslations /
 * getLocale from setRequestLocale, and that has to be set in the page's own
 * segment, not only the layout's — hence a shared helper rather than threading
 * the value down.
 */
export async function viewerLocale(): Promise<Locale> {
  const profile = await getProfile();
  if (profile) return profile.locale;

  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  return hasLocale(chosen) ? chosen : DEFAULT_LOCALE;
}
