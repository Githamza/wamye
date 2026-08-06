import type { Location } from "@capgo/background-geolocation";
import { isNativeApp } from "./platform";

/**
 * The native position source, wrapping @capgo/background-geolocation.
 *
 * The plugin runs a single watcher: start() replaces any previous one and
 * stop() ends it. Passing `backgroundMessage` is what raises the Android
 * foreground service and its persistent notification — without it (T2) the
 * watcher only reports while the app is in the foreground, which is exactly
 * the web loop's honest scope.
 *
 * This module is only ever loaded via dynamic import behind isNativeApp(),
 * so browser bundles never contain the plugin.
 */

export type { Location as NativeFix };

export type WatcherOptions = {
  /**
   * French notification body for the foreground service. Omit for
   * foreground-only tracking (no service, no notification).
   */
  backgroundMessage?: string;
  onFix: (fix: Location) => void;
  /** Location permission refused — surface it, never track half-way. */
  onDenied: () => void;
};

/** Starts the watcher; resolves to the function that stops it. */
export async function startNativeWatcher(
  opts: WatcherOptions,
): Promise<() => Promise<void>> {
  // UA spoofing or a stale prop could get us here in a browser; the bridge
  // check is authoritative, and a no-op beats a plugin error.
  if (!isNativeApp()) return async () => {};

  const { BackgroundGeolocation } = await import("@capgo/background-geolocation");

  // The watcher is a singleton and callers restart it to switch modes (course
  // started or ended). The old watcher's stop() and this start() would
  // otherwise race on the bridge; an explicit stop first makes restart safe
  // and is a no-op when nothing runs.
  await BackgroundGeolocation.stop().catch(() => {});

  await BackgroundGeolocation.start(
    {
      requestPermissions: true,
      stale: false,
      // Every movement matters: the POST loop already throttles to 15 s.
      distanceFilter: 0,
      ...(opts.backgroundMessage
        ? { backgroundMessage: opts.backgroundMessage, backgroundTitle: "Wamye" }
        : {}),
    },
    (position, error) => {
      if (error) {
        // The plugin's denial codes across versions; anything else is a
        // transient provider error the next fix will recover from.
        if (error.code === "NOT_AUTHORIZED" || error.code === "PERMISSION_DENIED") {
          opts.onDenied();
        }
        return;
      }
      if (position) opts.onFix(position);
    },
  );

  return () => BackgroundGeolocation.stop();
}
