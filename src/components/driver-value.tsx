// Shared "why register as a driver" benefits list, used by both the login and
// signup pages. The copy comes from the "Driver" namespace so it renders in the
// reader's chosen locale (French, or Tunisian Arabic via the login switcher).

import { useTranslations } from "next-intl";

// Each benefit pairs an icon with its message key. The icons are language-
// neutral, so only the text is translated.
const BENEFITS = [
  { icon: "📦", key: "benefitOrders" },
  { icon: "🔗", key: "benefitShareLink" },
  { icon: "🗺️", key: "benefitZone" },
  { icon: "💵", key: "benefitCod" },
] as const;

export function DriverValue({ className = "" }: { className?: string }) {
  const t = useTranslations("Driver");

  return (
    <ul
      className={`flex flex-col gap-2.5 rounded-[12px] border border-brand-border bg-brand-bg p-4 ${className}`}
    >
      {BENEFITS.map((benefit) => (
        <li key={benefit.key} className="flex items-start gap-2.5">
          <span className="text-[15px] leading-tight" aria-hidden>
            {benefit.icon}
          </span>
          <span className="text-[13px] leading-relaxed text-brand-ink/80">{t(benefit.key)}</span>
        </li>
      ))}
    </ul>
  );
}
