"use client";

import { useEffect, useRef, useState } from "react";
import type { LatLng } from "@/lib/order-types";
import {
  useForegroundPosition,
  type ForegroundPosition,
} from "@/lib/hooks/use-foreground-position";

/**
 * One position source per platform, one interface for the board.
 *
 * `nativeShell` comes from the server (User-Agent, see src/lib/native/shell.ts)
 * and never changes during a page's life, so both hooks below can run
 * unconditionally with the losing branch disabled — no conditional hook
 * calls, no double watcher.
 *
 * Web: the untouched foreground loop. Native: the @capgo plugin, which at
 * this stage (T2) mirrors the web loop's honest foreground-only scope; T3
 * upgrades it to a foreground service during an active course.
 */

/** Same cadence as the web loop: one POST per this many ms. */
const POST_INTERVAL_MS = 15_000;

export function useDriverPosition(
  orderId: string | null,
  nativeShell: boolean,
): ForegroundPosition {
  const web = useForegroundPosition(orderId, !nativeShell);
  const native = useNativePosition(orderId, nativeShell);
  return nativeShell ? native : web;
}

function useNativePosition(
  orderId: string | null,
  enabled: boolean,
): ForegroundPosition {
  const [position, setPosition] = useState<LatLng | null>(null);
  const [denied, setDenied] = useState(false);
  const [sharing, setSharing] = useState(false);

  // Refs for the same reason as the web hook: the watcher callback must see
  // the current course without the watcher being torn down.
  const lastPostRef = useRef(0);
  const orderRef = useRef(orderId);

  useEffect(() => {
    orderRef.current = orderId;
  }, [orderId]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let stopWatcher: (() => Promise<void>) | null = null;

    async function send(fix: {
      latitude: number;
      longitude: number;
      accuracy: number;
      bearing: number | null;
      speed: number | null;
    }) {
      const now = Date.now();
      if (now - lastPostRef.current < POST_INTERVAL_MS) return;
      lastPostRef.current = now;
      try {
        await fetch("/api/driver/position", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            orderId: orderRef.current,
            lat: fix.latitude,
            lng: fix.longitude,
            accuracy: fix.accuracy,
            heading: fix.bearing,
            speed: fix.speed,
          }),
          keepalive: true,
        });
      } catch {
        /* transient — the next fix will carry the position anyway */
      }
    }

    // Dynamic import: browsers with a spoofed UA pay one no-op module load;
    // real browsers never even fetch the plugin code.
    void import("@/lib/native/background-position").then(async (mod) => {
      if (cancelled) return;
      stopWatcher = await mod.startNativeWatcher({
        onFix: (fix) => {
          setSharing(true);
          setPosition({ lat: fix.latitude, lng: fix.longitude });
          void send(fix);
        },
        onDenied: () => {
          setDenied(true);
          setSharing(false);
        },
      });
      if (cancelled) void stopWatcher();
    });

    return () => {
      cancelled = true;
      setSharing(false);
      void stopWatcher?.();
    };
  }, [enabled]);

  return { position, denied, sharing };
}
