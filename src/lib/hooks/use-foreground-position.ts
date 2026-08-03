"use client";

import { useEffect, useRef, useState } from "react";
import type { LatLng } from "@/lib/order-types";

/**
 * Foreground-only position sharing.
 *
 * A PWA cannot track in the background — no service worker wakes for
 * geolocation, and iOS suspends the page the moment it is hidden. So this is
 * honest about its scope: it watches while the tab is visible and stops when it
 * is not. The driver sees a banner saying so; silent half-working tracking
 * would be worse than none.
 *
 * Two modes, one loop:
 *   * `orderId` set    — an active course: the fix lands in driver_positions and
 *                        on the order, feeding the customer's map;
 *   * `orderId` null   — merely open: only profiles.last_* is refreshed, which
 *                        is what makes the dispatch radius computable for an
 *                        idle driver (the one we most want to reach).
 */

/** One POST per this many ms, however fast the device reports. */
const POST_INTERVAL_MS = 15_000;

export type ForegroundPosition = {
  /** Latest fix, or null while we have none. */
  position: LatLng | null;
  /** True once the user has refused, so the UI can stop pretending. */
  denied: boolean;
  /** True while the watch is running (tab visible + permission granted). */
  sharing: boolean;
};

export function useForegroundPosition(orderId: string | null): ForegroundPosition {
  const [position, setPosition] = useState<LatLng | null>(null);
  const [denied, setDenied] = useState(false);
  const [sharing, setSharing] = useState(false);

  // Kept in refs so the watch callback never needs re-registering.
  const lastPostRef = useRef(0);
  const orderRef = useRef(orderId);

  // In an effect, not during render: the watch below reads this ref, so it can
  // follow a course starting or ending without being torn down.
  useEffect(() => {
    orderRef.current = orderId;
  }, [orderId]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    let watchId: number | null = null;
    let wakeLock: WakeLockSentinel | null = null;
    let stopped = false;

    async function send(coords: GeolocationCoordinates) {
      const now = Date.now();
      if (now - lastPostRef.current < POST_INTERVAL_MS) return;
      lastPostRef.current = now;
      try {
        await fetch("/api/driver/position", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            orderId: orderRef.current,
            lat: coords.latitude,
            lng: coords.longitude,
            accuracy: coords.accuracy,
            heading: coords.heading,
            speed: coords.speed,
          }),
          // Survive the tab being backgrounded mid-flight.
          keepalive: true,
        });
      } catch {
        /* transient — the next fix will carry the position anyway */
      }
    }

    function start() {
      if (stopped || watchId !== null) return;
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setSharing(true);
          setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          void send(pos.coords);
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) setDenied(true);
          setSharing(false);
        },
        { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
      );

      // Without this the screen sleeps at the first red light and positions
      // stop. Only worth holding during an actual course.
      if (orderRef.current && "wakeLock" in navigator) {
        void navigator.wakeLock
          .request("screen")
          .then((s) => {
            wakeLock = s;
          })
          .catch(() => {
            /* denied or unsupported — not fatal */
          });
      }
    }

    function stop() {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
      setSharing(false);
      void wakeLock?.release().catch(() => {});
      wakeLock = null;
    }

    function onVisibility() {
      if (document.visibilityState === "visible") start();
      else stop();
    }

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
    // orderId is read through a ref, so the watch survives a course starting or
    // ending without being torn down and re-prompting for permission.
  }, []);

  return { position, denied, sharing };
}
