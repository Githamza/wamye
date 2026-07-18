import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { Logo } from "@/components/logo";
import { hasLocale } from "@/i18n/locales";

// Title and description come from the [lang] layout's generateMetadata.

export default async function LandingPage({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  setRequestLocale(lang);

  const t = await getTranslations("RoleChoice");

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-3xl flex-col px-5 py-6 sm:py-10">
      <header className="flex items-center justify-between">
        <Logo />
        <LocaleSwitcher />
      </header>

      <main className="flex flex-1 flex-col justify-center gap-8 py-10">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-[28px] leading-[1.15] font-extrabold tracking-tight text-stone-ink sm:text-[34px]">
            {t("title")}
          </h1>
          <p className="text-[15px] leading-relaxed text-stone-muted">{t("subtitle")}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Client → the existing directory. */}
          <Link
            href={`/${lang}/client`}
            className="group flex flex-col gap-3 rounded-[16px] border border-hair bg-white p-6 transition-colors hover:border-brand-border hover:bg-brand-bg"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-[12px] bg-hair-2 text-[24px]">
              🛍️
            </span>
            <div className="flex flex-col gap-1">
              <span className="text-[17px] font-bold text-stone-ink">{t("clientTitle")}</span>
              <span className="text-[13.5px] leading-relaxed text-stone-muted">
                {t("clientBody")}
              </span>
            </div>
            <span className="mt-auto inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-brand">
              {t("clientAction")}
              <span className="inline-block rtl:rotate-180">›</span>
            </span>
          </Link>

          {/* Driver → the rebuilt login page. Highlighted in brand style.
              A plain <a>, not <Link>: /login lives in the (app) group, whose
              language comes from the cookie rather than this URL. A client-side
              Link navigation would serve a prefetched copy rendered before the
              cookie was synced (French), leaving the document in the wrong
              language; a full load makes /login arrive fresh in the cookie's
              locale. Same reason the LocaleSwitcher is an <a>. */}
          <a
            href="/login"
            className="group flex flex-col gap-3 rounded-[16px] border border-brand bg-brand p-6 text-white shadow-sm transition-colors hover:bg-brand-hover"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-[12px] bg-white/15 text-[24px]">
              🛵
            </span>
            <div className="flex flex-col gap-1">
              <span className="text-[17px] font-bold">{t("driverTitle")}</span>
              <span className="text-[13.5px] leading-relaxed text-white/85">
                {t("driverBody")}
              </span>
            </div>
            <span className="mt-auto inline-flex items-center gap-1.5 text-[13.5px] font-semibold">
              {t("driverAction")}
              <span className="inline-block rtl:rotate-180">›</span>
            </span>
          </a>
        </div>
      </main>

      <footer className="border-t border-hair pt-5 text-[12.5px] text-stone-faint">
        {t("footer")}
      </footer>
    </div>
  );
}
