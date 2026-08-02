"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { usePlatform } from "@/components/navigator-platform";

/**
 * Relay that hands a driver off to the installed Navigator app.
 *
 * Emails cannot link to `flbnavigator://` directly: Brevo rewrites every
 * href into a click-tracking URL and its parser rejects a scheme with no
 * host ("cleanURL: invalid URL: host missing"), so the driver landed on a
 * 404 instead of the app — and Gmail strips non-http hrefs anyway. The
 * alert mail therefore links to this https page, which fires the deep
 * link from the browser where custom schemes are allowed.
 *
 * Plain `flbnavigator://` (no ?configure) on purpose: this only opens an
 * already-connected app. First-time setup stays on /connect/<token>, which
 * carries the tenant key.
 */
const NAVIGATOR_URI = "flbnavigator://";

const storeLink =
  "flex h-10 items-center rounded-[8px] border border-hair bg-white px-3.5 text-[14px] font-medium text-stone-ink transition-colors hover:bg-hair-2";

export function NavigatorOpenApp({
  playUrl,
  appStoreUrl,
}: {
  playUrl: string;
  appStoreUrl: string;
}) {
  const t = useTranslations("OpenApp");
  const platform = usePlatform();
  // One automatic attempt on a phone — a ref, not state, so re-running the
  // effect (platform settles from "other" on the client) can't fire twice.
  // On a desktop the scheme has nowhere to go and the browser would only
  // show an error dialog, so we don't try at all.
  const tried = useRef(false);
  useEffect(() => {
    if (platform === "other" || tried.current) return;
    tried.current = true;
    window.location.href = NAVIGATOR_URI;
  }, [platform]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[14px] leading-relaxed text-stone-muted">
        {platform === "other" ? t("desktopHint") : t("body")}
      </p>

      {platform !== "other" && (
        <a
          href={NAVIGATOR_URI}
          className="flex h-12 w-fit items-center rounded-[10px] bg-brand px-6 text-[15px] font-semibold text-white"
        >
          {t("openButton")}
        </a>
      )}

      <p className="text-[13px] leading-relaxed text-stone-muted">{t("fallback")}</p>

      <div className="flex flex-wrap gap-2">
        {platform !== "ios" && (
          <a href={playUrl} target="_blank" rel="noopener noreferrer" className={storeLink}>
            {t("playStore")}
          </a>
        )}
        {platform !== "android" && (
          <a href={appStoreUrl} target="_blank" rel="noopener noreferrer" className={storeLink}>
            {t("appStore")}
          </a>
        )}
      </div>
    </div>
  );
}
