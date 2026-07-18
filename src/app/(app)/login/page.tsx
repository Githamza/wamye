import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { LoginForm } from "@/components/login-form";
import { DriverValue } from "@/components/driver-value";
import { DashboardLocaleSwitcher } from "@/components/dashboard-locale-switcher";
import { getSessionUser } from "@/lib/auth/dal";
import type { Locale } from "@/i18n/locales";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const nextRaw = params.next;
  // Only allow same-site relative redirects to avoid an open-redirect.
  const next =
    typeof nextRaw === "string" && nextRaw.startsWith("/") ? nextRaw : "/dashboard";

  // Already signed in → skip the form.
  if (await getSessionUser()) redirect(next);

  // The (app) layout resolves the locale from the cookie (no profile yet) and
  // sets it as the request locale, so getTranslations/getLocale read it here.
  const t = await getTranslations("Login");
  const locale = (await getLocale()) as Locale;

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-4xl flex-col justify-center gap-10 p-6 lg:flex-row lg:items-center lg:gap-16">
      {/* Value panel — why a driver signs up / signs in. */}
      <section className="flex flex-1 flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="flex w-fit items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-brand-fill text-[18px]">
              🛵
            </span>
            <span className="text-[17px] font-bold tracking-tight text-stone-ink">Wamye</span>
          </Link>
          {/* No locale in these URLs, so switching is a cookie write (a Server
              Action), not a link — same control the dashboard uses. */}
          <DashboardLocaleSwitcher current={locale} />
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="text-[26px] leading-[1.15] font-extrabold tracking-tight text-stone-ink sm:text-[30px]">
            {t("valueTitle")}
          </h2>
          <p className="max-w-md text-[14px] leading-relaxed text-stone-muted">
            {t("valueBody")}
          </p>
        </div>
        <DriverValue />
      </section>

      {/* Form panel. */}
      <div className="w-full lg:max-w-sm lg:flex-1">
        <LoginForm next={next} />
      </div>
    </div>
  );
}
