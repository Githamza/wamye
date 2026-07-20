import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { viewerLocale } from "@/i18n/viewer-locale";
import { DashboardLocaleSwitcher } from "@/components/dashboard-locale-switcher";
import { NavigatorConnectSteps } from "@/components/navigator-connect-steps";
import { getTenantFleetbaseContext } from "@/lib/tenant";
import {
  buildNavigatorDeepLinks,
  getTenantByNavigatorToken,
  NAVIGATOR_APP_STORE_URL,
  NAVIGATOR_PLAY_URL,
} from "@/lib/navigator-link";

export const dynamic = "force-dynamic";

// The URL is the credential (see navigator-link.ts) — keep it out of indexes.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * The public page behind a tenant's Navigator connection link. A driver
 * opens it on their phone (from WhatsApp, the approval email, or the team
 * page's QR) and walks three steps: install the app, tap connect (the
 * deep link configures the app for this tenant's instance), sign in with
 * their phone number.
 *
 * Public on purpose — drivers are not signed in here; the random token is
 * what stands in for auth. Locale comes from the cookie (default French),
 * with the same switcher the auth pages use.
 */
export default async function ConnectPage(props: {
  params: Promise<{ token: string }>;
}) {
  const locale = await viewerLocale();
  setRequestLocale(locale);
  const t = await getTranslations("Connect");

  const { token } = await props.params;
  const tenant = await getTenantByNavigatorToken(token);
  if (!tenant) notFound();

  // No stored key yet → nothing to configure the app with. The tenant shows
  // as not-ready rather than 404: the link itself is legitimate.
  const ctx = await getTenantFleetbaseContext(tenant.slug);
  const links = ctx ? buildNavigatorDeepLinks(ctx) : null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-4 py-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-lg font-semibold text-stone-ink">{t("title")}</h1>
          <p className="text-[13px] leading-relaxed text-stone-muted">
            {t("intro", { tenant: tenant.name })}
          </p>
        </div>
        <DashboardLocaleSwitcher current={locale} />
      </div>

      <div className="rounded-[14px] border border-hair bg-white p-4">
        {links ? (
          <NavigatorConnectSteps
            iosLink={links.ios}
            androidLink={links.android}
            playUrl={NAVIGATOR_PLAY_URL}
            appStoreUrl={NAVIGATOR_APP_STORE_URL}
          />
        ) : (
          <p className="text-[14px] leading-relaxed text-stone-muted">{t("notReady")}</p>
        )}
      </div>
    </main>
  );
}
