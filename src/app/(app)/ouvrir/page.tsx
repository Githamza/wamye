import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { viewerLocale } from "@/i18n/viewer-locale";
import { DashboardLocaleSwitcher } from "@/components/dashboard-locale-switcher";
import { NavigatorOpenApp } from "@/components/navigator-open-app";
import {
  NAVIGATOR_APP_STORE_URL,
  NAVIGATOR_PLAY_URL,
} from "@/lib/navigator-link";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * The landing page for the "Ouvrir Navigator" button in the new-order alert
 * email. Public and tenant-agnostic: it only bounces an already-connected
 * driver into the app (see navigator-open-app.tsx for why the mail can't
 * link to the deep link itself). Setting a phone up for the first time is
 * /connect/<token>'s job.
 */
export default async function OpenNavigatorPage() {
  const locale = await viewerLocale();
  setRequestLocale(locale);
  const t = await getTranslations("OpenApp");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-4 py-6">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-lg font-semibold text-stone-ink">{t("title")}</h1>
        <DashboardLocaleSwitcher current={locale} />
      </div>

      <div className="rounded-[14px] border border-hair bg-white p-4">
        <NavigatorOpenApp
          playUrl={NAVIGATOR_PLAY_URL}
          appStoreUrl={NAVIGATOR_APP_STORE_URL}
        />
      </div>
    </main>
  );
}
