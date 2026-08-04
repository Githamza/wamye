"use client";

import { useEffect, useRef, useState } from "react";
import { isSettled, type TrackedOrder } from "@/lib/order-types";

/**
 * Live state for every course the customer is following, keyed by its tracking
 * token.
 *
 * One loop for all of them rather than one per screen: the list and the
 * timeline read the same map, so opening a course never starts a second poll of
 * it, and two running courses cost two requests per tick instead of two
 * independent timers drifting apart.
 *
 * Entries are never pruned. A course that settles leaves the list the customer
 * can act on, but its last state has to survive — they may be looking at its
 * timeline at that exact moment, and it must land on "Livré" rather than blank.
 */
export type TrackedOrders = Record<string, TrackedOrder>;

/** While a course is still looking for a driver, that is the news to catch. */
const TICK_SEARCHING_MS = 8_000;
/** Once every remaining course has one, the interesting change has happened. */
const TICK_ENROUTE_MS = 15_000;

export function useTrackedOrders(tokens: string[]): TrackedOrders {
  const [tracked, setTracked] = useState<TrackedOrders>({});

  // Read by the loop to decide what still needs polling. Kept in a ref so a
  // landing stage does not tear the loop down and restart it.
  const trackedRef = useRef(tracked);
  useEffect(() => {
    trackedRef.current = tracked;
  }, [tracked]);

  // The effect's identity is the *set* of tokens, not the array — the parent
  // rebuilds that array on every render.
  const key = tokens.join(",");

  useEffect(() => {
    const list = key ? key.split(",") : [];
    if (list.length === 0) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      const live = list.filter((tk) => {
        const stage = trackedRef.current[tk]?.stage;
        return !stage || !isSettled(stage);
      });
      if (live.length === 0) return;

      const results = await Promise.all(
        live.map(async (tk) => {
          try {
            const res = await fetch(`/api/track/${tk}`, { cache: "no-store" });
            if (!res.ok) return null;
            return [tk, (await res.json()) as TrackedOrder] as const;
          } catch {
            return null; // transient — keep the last known stage
          }
        }),
      );
      if (cancelled) return;

      const fresh = results.filter((r) => r !== null);
      if (fresh.length > 0) {
        setTracked((prev) => ({ ...prev, ...Object.fromEntries(fresh) }));
      }

      // Decide the cadence from what just came back, not from the ref: it is a
      // render behind, and a course that just found a driver would be polled
      // once more at the fast rate for nothing.
      const stages = live.map(
        (tk) =>
          fresh.find(([t]) => t === tk)?.[1].stage ??
          trackedRef.current[tk]?.stage,
      );
      const running = stages.filter((s) => !s || !isSettled(s));
      if (running.length === 0) return;

      timer = setTimeout(
        tick,
        running.every((s) => s === "enroute")
          ? TICK_ENROUTE_MS
          : TICK_SEARCHING_MS,
      );
    }

    void tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [key]);

  return tracked;
}
