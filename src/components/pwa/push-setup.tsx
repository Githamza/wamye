"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  savePushSubscription,
  deletePushSubscription,
} from "@/lib/actions/push";

/**
 * Service worker registration and the notification opt-in.
 *
 * There is no way to switch notifications on for a driver: the permission has
 * to come from their own tap, the subscription key is generated on the phone,
 * and no browser lets a site pre-grant either. So the only lever we have is
 * making the step impossible to miss — hence the banner rather than the quiet
 * row this used to be, which is precisely why it went unnoticed.
 *
 * Restraint matters in one direction though: a driver who REFUSES can never be
 * asked again by us — iOS only lets them undo it in Settings. So the banner
 * pushes while the answer is still open, and goes quiet once it is "no",
 * showing how to undo it instead of nagging.
 *
 * Three platform rules the Next PWA guide is explicit about:
 *   1. `beforeinstallprompt` does not exist on Safari iOS — most of our drivers
 *      — so the install path is written instructions, not a button;
 *   2. on iOS, push requires the app to be INSTALLED to the home screen and
 *      iOS ≥ 16.4; calling subscribe() in a Safari tab throws;
 *   3. Notification.requestPermission() must come from a user gesture, never
 *      from an effect.
 */

/**
 * VAPID keys travel as base64url; applicationServerKey wants raw bytes.
 * Backed by a fresh ArrayBuffer rather than Uint8Array.from(), whose type is
 * ArrayBufferLike and so is not assignable to BufferSource.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

type State =
  | "loading"
  | "unsupported"
  | "needs-install"
  | "off"
  | "on"
  | "denied"
  | "failed";

/** Hidden for this session only — the ask returns next time the app opens. */
const SNOOZE_KEY = "wamye_push_snoozed";

export function PushSetup() {
  const t = useTranslations("Dashboard.push");
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [snoozed, setSnoozed] = useState(false);

  useEffect(() => {
    // Everything runs inside the async body: setting state synchronously in an
    // effect triggers a cascading render, and React 19 lints it.
    void (async () => {
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        // Older iOS exposes it here and nowhere else.
        (window.navigator as { standalone?: boolean }).standalone === true;

      setIsIOS(ios);
      setSnoozed(sessionStorage.getItem(SNOOZE_KEY) === "1");

      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setState(ios && !standalone ? "needs-install" : "unsupported");
        return;
      }

      // On iOS the API exists but subscribing only works once installed, so
      // say that BEFORE touching the service worker: a registration that hangs
      // must not be what stops the driver seeing the instructions.
      if (ios && !standalone) {
        setState("needs-install");
        return;
      }

      try {
        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        if (Notification.permission === "denied") {
          setState("denied");
          return;
        }
        const existing = await reg.pushManager.getSubscription();
        setState(existing ? "on" : "off");
      } catch (err) {
        // Without this the promise rejected, state stayed "loading", and the
        // component rendered nothing at all — a driver looking for the button
        // would find no card and no reason why. Failing loudly beats vanishing.
        console.error("[push] service worker registration failed:", err);
        setState("failed");
      }
    })();
  }, []);

  async function enable() {
    setBusy(true);
    try {
      // From the click, not from an effect — see rule 3 above.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) {
        // Almost always the Dockerfile ARG being missing in a built image.
        console.error("[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set");
        setState("unsupported");
        return;
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });

      const res = await savePushSubscription(
        JSON.parse(JSON.stringify(sub)),
        navigator.userAgent,
      );
      setState(res.ok ? "on" : "off");
    } catch (err) {
      console.error("[push] subscribe failed:", err);
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await deletePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  function snooze() {
    sessionStorage.setItem(SNOOZE_KEY, "1");
    setSnoozed(true);
  }

  if (state === "loading" || state === "unsupported") return null;

  // ---- Already on: one quiet line, and a way back out. ----
  if (state === "on") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-[14px] border border-hair bg-white px-4 py-3">
        <span className="min-w-0 text-[13px] text-stone-muted">{t("on")}</span>
        <button
          type="button"
          disabled={busy}
          onClick={() => void disable()}
          className="flex h-8 flex-none items-center rounded-[8px] border border-hair px-3 text-[12px] font-medium text-stone-muted transition-colors hover:bg-hair-2 disabled:opacity-60"
        >
          {t("disable")}
        </button>
      </div>
    );
  }

  // ---- Refused: no second ask from us — iOS only lets them undo it in
  //      Settings — so this explains how instead of pushing. ----
  if (state === "denied") {
    return (
      <div className="flex flex-col gap-1 rounded-[14px] border border-hair bg-white p-4">
        <span className="text-[14px] font-medium text-stone-ink">
          {t("title")}
        </span>
        <span className="text-[13px] text-stone-muted">{t("denied")}</span>
        <span className="text-[13px] text-stone-muted">
          {isIOS ? t("deniedHowIos") : t("deniedHowAndroid")}
        </span>
      </div>
    );
  }

  if (state === "failed") {
    return (
      <div className="rounded-[14px] border border-hair bg-white p-4 text-[13px] text-stone-muted">
        {t("failed")}
      </div>
    );
  }

  // "off" and "needs-install" are the two states worth interrupting for: the
  // driver is not reachable and does not know it.
  if (snoozed) return null;

  const needsInstall = state === "needs-install";

  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-danger-border bg-danger-bg p-4">
      <div className="flex flex-col gap-1">
        <span className="text-[15px] font-semibold text-danger-ink">
          {needsInstall ? t("installTitle") : t("bannerTitle")}
        </span>
        <span className="text-[13px] leading-relaxed text-danger-ink">
          {needsInstall ? t("installBody") : t("bannerBody")}
        </span>
      </div>

      {needsInstall ? (
        <ol className="flex list-decimal flex-col gap-1 ps-5 text-[13px] text-danger-ink">
          <li>{isIOS ? t("iosStep1") : t("androidStep1")}</li>
          <li>{isIOS ? t("iosStep2") : t("androidStep2")}</li>
          <li>{t("step3OpenFromIcon")}</li>
        </ol>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void enable()}
          className="flex h-12 items-center justify-center rounded-[10px] bg-brand text-[15px] font-semibold text-white transition-opacity disabled:opacity-60"
        >
          {t("enable")}
        </button>
      )}

      <button
        type="button"
        onClick={snooze}
        className="self-center text-[12px] font-medium text-stone-muted underline underline-offset-2"
      >
        {t("later")}
      </button>
    </div>
  );
}
