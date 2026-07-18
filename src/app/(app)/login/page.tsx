import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LoginForm } from "@/components/login-form";
import { DriverValue } from "@/components/driver-value";
import { DashboardLocaleSwitcher } from "@/components/dashboard-locale-switcher";
import { Logo } from "@/components/logo";
import { getSessionUser } from "@/lib/auth/dal";
import { viewerLocale } from "@/i18n/viewer-locale";

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

  // next-intl resolves getTranslations from the request locale, and that must
  // be set in this page's own segment — the layout's call does not reach here,
  // so without this the form falls back to French even for an ar-TN reader.
  const locale = await viewerLocale();
  setRequestLocale(locale);
  const t = await getTranslations("Login");

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-4xl flex-col justify-center gap-10 p-6 lg:flex-row lg:items-center lg:gap-16">
      {/* Value panel — why a driver signs up / signs in. */}
      <section className="flex flex-1 flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="flex w-fit items-center">
            <Logo />
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
