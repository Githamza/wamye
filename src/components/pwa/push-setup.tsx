"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  savePushSubscription,
  deletePushSubscription,
} from "@/lib/actions/push";

/**
 * Service worker registration + the notification opt-in, in one place.
 *
 * Registered here rather than in the (app) root layout: /login, /signup and the
 * customer surface have no business running a driver service worker.
 *
 * Three platform rules the Next PWA guide is explicit about, and which drive
 * everything below:
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

export function PushSetup() {
  const t = useTranslations("Dashboard.push");
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

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
    } catch {
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

  if (state === "loading" || state === "unsupported") return null;

  return (
    <div className="flex flex-col gap-2 rounded-[14px] border border-hair bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[14px] font-medium text-stone-ink">
            {t("title")}
          </span>
          <span className="text-[13px] text-stone-muted">
            {state === "on"
              ? t("on")
              : state === "denied"
                ? t("denied")
                : state === "needs-install"
                  ? t("installFirst")
                  : state === "failed"
                    ? t("failed")
                    : t("off")}
          </span>
        </div>

        {(state === "off" || state === "on") && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void (state === "on" ? disable() : enable())}
            className="flex h-9 flex-none items-center rounded-[8px] border border-hair px-3 text-[13px] font-medium text-stone-ink transition-colors hover:bg-hair-2 disabled:opacity-60"
          >
            {state === "on" ? t("disable") : t("enable")}
          </button>
        )}
      </div>

      {state === "needs-install" && (
        <ol className="flex flex-col gap-1 border-t border-hair pt-2 text-[13px] text-stone-muted">
          <li>{isIOS ? t("iosStep1") : t("androidStep1")}</li>
          <li>{isIOS ? t("iosStep2") : t("androidStep2")}</li>
        </ol>
      )}
    </div>
  );
}
