"use client";

import { useLocale } from "next-intl";
import { usePathname } from "next/navigation";
import { Languages } from "lucide-react";
import {
  LOCALE_COOKIE,
  LOCALE_LABEL,
  type Locale,
  otherLocale,
} from "@/i18n/locales";

/** A year: long enough that a reader sets this once and forgets it. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Swaps between the two locales.
 *
 * Deliberately an <a> and not a <Link>. The locale lives in the path, and the
 * whole document responds to it — `lang`, `dir`, and which font resolves each
 * glyph. A client-side navigation would swap the text while React reconciles
 * <html> attributes around it; a full load makes the document unambiguously
 * arrive in one language. It is a once-per-visit action, so the cost is fine.
 *
 * The cookie is what proxy.ts reads on a later visit to "/" or a bare
 * /t/[slug] link, so the choice survives beyond this URL.
 */
export function LocaleSwitcher() {
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const target = otherLocale(locale);

  // "/ar-TN/t/djerba" -> ["", "ar-TN", "t", "djerba"]; segment 1 is the locale,
  // always present because this only renders inside the [lang] segment.
  const segments = pathname.split("/");
  segments[1] = target;
  const href = segments.join("/");

  function remember() {
    document.cookie = `${LOCALE_COOKIE}=${target}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
  }

  return (
    <a
      href={href}
      onClick={remember}
      hrefLang={target}
      // The label is in the target language, so state the switch for anyone
      // who cannot read it.
      aria-label={`${LOCALE_LABEL[target]}`}
      className="flex flex-none items-center gap-1.5 rounded-[10px] border border-hair bg-white px-2.5 py-1.5 text-[13px] font-medium text-stone-muted2 transition-colors hover:bg-hair-2"
    >
      <Languages className="size-4" strokeWidth={1.5} />
      {LOCALE_LABEL[target]}
    </a>
  );
}
