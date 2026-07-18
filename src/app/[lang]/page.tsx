import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { isOpenNowIn, TUNISIA_TZ } from "@/lib/hours";
import { listPublicTenants } from "@/lib/tenant";
import { hasLocale } from "@/i18n/locales";

// The directory tracks tenant approvals and opening hours, so it is resolved
// per request rather than baked at build time.
export const dynamic = "force-dynamic";

// Title and description come from the [lang] layout's generateMetadata, which
// this page used to repeat verbatim.

const STEPS = [
  { icon: "🛍️", title: "step1Title", body: "step1Body" },
  { icon: "💬", title: "step2Title", body: "step2Body" },
  { icon: "🛵", title: "step3Title", body: "step3Body" },
] as const;

export default async function LandingPage({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  setRequestLocale(lang);

  const [t, tStatus, tenants] = await Promise.all([
    getTranslations("Landing"),
    getTranslations("Status"),
    listPublicTenants(),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-5 py-6 sm:py-10">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-brand-fill text-[18px]">
            🛵
          </span>
          <span className="text-[17px] font-bold tracking-tight text-stone-ink">
            Wamye
          </span>
        </div>
        <div className="flex items-center gap-2">
          <LocaleSwitcher />
          <Link
            href="/login"
            className="flex items-center gap-1.5 rounded-[10px] bg-brand px-3.5 py-2 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-hover"
          >
            <span aria-hidden>🛵</span>
            {t("driverArea")}
          </Link>
        </div>
      </header>

      <section className="flex flex-col gap-3">
        <h1 className="text-[30px] leading-[1.15] font-extrabold tracking-tight text-stone-ink sm:text-[38px]">
          {/* Each language picks its own break point. */}
          {t.rich("heroTitle", { br: () => <br /> })}
        </h1>
        <p className="max-w-xl text-[15px] leading-relaxed text-stone-muted">
          {t("heroBody")}
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold text-stone-ink">
            {t("directoryHeading")}
          </h2>
          {tenants.length > 0 && (
            <span className="text-[13px] text-stone-muted">
              {t("regionCount", { count: tenants.length })}
            </span>
          )}
        </div>

        {tenants.length === 0 ? (
          <div className="rounded-[12px] border border-hair bg-white px-4 py-8 text-center">
            <p className="text-[14px] text-stone-muted">{t("emptyTitle")}</p>
            <p className="mt-1 text-[13px] text-stone-faint">{t("emptyBody")}</p>
          </div>
        ) : (
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {tenants.map((tenant) => {
              const open = isOpenNowIn(tenant.hours, TUNISIA_TZ);
              return (
                <li key={tenant.slug}>
                  <Link
                    href={`/${lang}/t/${tenant.slug}`}
                    className="flex h-full items-center gap-3.5 rounded-[14px] border border-hair bg-white p-4 transition-colors hover:border-brand-border hover:bg-brand-bg"
                  >
                    <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-brand-fill text-[20px]">
                      {tenant.branding.logoEmoji ?? "🛵"}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="truncate text-[15px] font-semibold text-stone-ink">
                        {tenant.branding.name || tenant.name}
                      </span>
                      <span className="flex items-center gap-2 text-[12.5px] text-stone-muted">
                        {tenant.branding.areaLabel && (
                          <span className="truncate">{tenant.branding.areaLabel}</span>
                        )}
                        <span
                          className={`flex flex-none items-center gap-1 ${
                            open ? "text-success" : "text-stone-faint"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              open ? "bg-success" : "bg-stone-faint"
                            }`}
                          />
                          {open ? tStatus("open") : tStatus("closed")}
                        </span>
                      </span>
                    </div>
                    {/* Points into the page, so it turns around in RTL. */}
                    <span className="inline-block flex-none text-[18px] text-stone-faint rtl:rotate-180">
                      ›
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold text-stone-ink">
          {t("stepsHeading")}
        </h2>
        <ul className="grid gap-2.5 sm:grid-cols-3">
          {STEPS.map((step) => (
            <li
              key={step.title}
              className="flex flex-col gap-1.5 rounded-[14px] border border-hair bg-white p-4"
            >
              <span className="text-[22px]">{step.icon}</span>
              <span className="text-[14px] font-semibold text-stone-ink">
                {t(step.title)}
              </span>
              <span className="text-[13px] leading-relaxed text-stone-muted">
                {t(step.body)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3 rounded-[14px] border border-brand-border bg-brand-bg p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-[15px] font-semibold text-brand-ink">
            {t("ctaHeading")}
          </h2>
          <p className="text-[13px] leading-relaxed text-brand-ink/75">
            {t("ctaBody")}
          </p>
        </div>
        <Link
          href="/signup"
          className="flex-none rounded-[10px] bg-brand px-4 py-2.5 text-center text-[14px] font-semibold text-white transition-colors hover:bg-brand-hover"
        >
          {t("ctaAction")}
        </Link>
      </section>

      <footer className="border-t border-hair pt-5 text-[12.5px] text-stone-faint">
        {t("footer")}
      </footer>
    </div>
  );
}
