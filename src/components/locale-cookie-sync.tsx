"use client";

import { useEffect } from "react";
import { LOCALE_COOKIE, type Locale } from "@/i18n/locales";

/** A year: long enough that a reader sets this once and forgets it. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Mirrors the [lang] URL's locale into the cookie the (app) group reads.
 *
 * proxy.ts writes this cookie when it redirects "/" or "/t/x" into a locale,
 * but it never runs on an already-prefixed URL. So a shared /ar-TN link opened
 * directly leaves the cookie untouched, and a click through to /login (which
 * reads the cookie, not the URL) would fall back to French. Writing it here
 * closes that gap for direct visits. Client-side because a Server Component
 * cannot set a cookie during render.
 */
export function LocaleCookieSync({ locale }: { locale: Locale }) {
  useEffect(() => {
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
  }, [locale]);

  return null;
}
