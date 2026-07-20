"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { usePlatform } from "@/components/navigator-platform";
import { NavigatorConnectButton } from "@/components/navigator-connect-button";

/**
 * Remembered per device: a driver who already confirmed the install lands
 * back on step 2 unlocked when they return from the store or the email link.
 * Read through useSyncExternalStore with a server fallback — the server
 * render shows step 1 locked, the client corrects it without an effect.
 */
const INSTALLED_KEY = "wamye_navigator_installed";

const installedListeners = new Set<() => void>();
function subscribeInstalled(listener: () => void) {
  installedListeners.add(listener);
  return () => installedListeners.delete(listener);
}
function readInstalled(): boolean {
  return localStorage.getItem(INSTALLED_KEY) === "1";
}
function markInstalled() {
  localStorage.setItem(INSTALLED_KEY, "1");
  installedListeners.forEach((listener) => listener());
}

const storeLink =
  "flex h-10 items-center rounded-[8px] border border-hair bg-white px-3.5 text-[14px] font-medium text-stone-ink transition-colors hover:bg-hair-2";

function StepBadge({ number, done }: { number: number; done?: boolean }) {
  return (
    <span
      className={`flex size-6 flex-none items-center justify-center rounded-full text-[12px] font-semibold text-white ${done ? "bg-success" : "bg-brand"}`}
    >
      {done ? "✓" : number}
    </span>
  );
}

/**
 * The driver-facing connection walkthrough. Install-first on purpose: the
 * configure deep link is useless (and confusing — a tap that does nothing)
 * until the app exists on the phone, so it stays hidden behind an explicit
 * "I installed the app" confirmation.
 */
export function NavigatorConnectSteps({
  iosLink,
  androidLink,
  playUrl,
  appStoreUrl,
}: {
  iosLink: string;
  androidLink: string;
  playUrl: string;
  appStoreUrl: string;
}) {
  const t = useTranslations("Connect");
  const platform = usePlatform();
  const installed = useSyncExternalStore(subscribeInstalled, readInstalled, () => false);

  return (
    <ol className="flex flex-col gap-6">
      <li className="flex gap-3">
        <StepBadge number={1} done={installed} />
        <div className="flex min-w-0 flex-col gap-2">
          <div className="text-[15px] font-medium text-stone-ink">{t("step1Title")}</div>
          <p className="text-[13px] leading-relaxed text-stone-muted">{t("step1Body")}</p>
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
      </li>

      <li className="flex gap-3">
        <StepBadge number={2} />
        <div className="flex min-w-0 flex-col gap-2">
          <div className="text-[15px] font-medium text-stone-ink">{t("step2Title")}</div>
          <p className="text-[13px] leading-relaxed text-stone-muted">{t("step2Body")}</p>
          {!installed ? (
            <button
              type="button"
              onClick={markInstalled}
              className="h-11 w-fit rounded-[10px] border border-hair bg-white px-4 text-[14px] font-medium text-stone-ink hover:bg-hair-2"
            >
              {t("step2Confirm")}
            </button>
          ) : (
            <NavigatorConnectButton iosLink={iosLink} androidLink={androidLink} />
          )}
        </div>
      </li>

      <li className="flex gap-3">
        <StepBadge number={3} />
        <div className="flex min-w-0 flex-col gap-2">
          <div className="text-[15px] font-medium text-stone-ink">{t("step3Title")}</div>
          <p className="text-[13px] leading-relaxed text-stone-muted">{t("step3Body")}</p>
        </div>
      </li>
    </ol>
  );
}
