import { Languages } from "lucide-react";
import { setViewerLocale } from "@/lib/actions/locale";
import { LOCALE_LABEL, type Locale, otherLocale } from "@/i18n/locales";

/**
 * Swaps the dashboard's language.
 *
 * A form, not a link, unlike the customer-facing switcher: there is no locale
 * in these URLs to point at, so the choice is a write. It stays a server
 * component and posts a Server Action, which means it also works before
 * hydration.
 *
 * The label is the language being offered, named in itself — someone who
 * cannot read the current one still has to recognise their own.
 */
export function DashboardLocaleSwitcher({ current }: { current: Locale }) {
  const target = otherLocale(current);

  return (
    <form action={setViewerLocale}>
      <input type="hidden" name="locale" value={target} />
      <button
        type="submit"
        lang={target}
        aria-label={LOCALE_LABEL[target]}
        className="flex flex-none items-center gap-1.5 rounded-[8px] border border-hair bg-white px-2.5 py-1.5 text-[13px] font-medium text-stone-muted2 transition-colors hover:bg-hair-2"
      >
        <Languages className="size-4" strokeWidth={1.5} />
        {LOCALE_LABEL[target]}
      </button>
    </form>
  );
}
