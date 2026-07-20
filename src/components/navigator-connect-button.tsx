"use client";

import { useTranslations } from "next-intl";
import { usePlatform } from "@/components/navigator-platform";

/**
 * The one-tap "connect Navigator" button: fires the configure deep link
 * for this device (intent:// on Android, flbnavigator:// on iOS), which
 * points the installed app at the tenant's instance and restarts it.
 *
 * On a desktop the deep link has nowhere to go, so it degrades to a hint
 * to open the page on the phone instead.
 */
export function NavigatorConnectButton({
  iosLink,
  androidLink,
}: {
  iosLink: string;
  androidLink: string;
}) {
  const t = useTranslations("Connect");
  const platform = usePlatform();

  if (platform === "other") {
    return <p className="text-[13px] font-medium text-stone-muted2">{t("desktopHint")}</p>;
  }

  return (
    <>
      <a
        href={platform === "android" ? androidLink : iosLink}
        className="flex h-12 w-fit items-center rounded-[10px] bg-brand px-6 text-[15px] font-semibold text-white"
      >
        {t("connectButton")}
      </a>
      <p className="text-[12px] leading-relaxed text-stone-muted">{t("connectFallback")}</p>
    </>
  );
}
