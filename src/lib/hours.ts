// ============================================================
// Opening-hours logic — pure, parameterized by a tenant's Hours.
// ============================================================

import type { Hours } from "@/lib/config-types";

/** Every tenant delivers in Tunisia (tenants.phone_country defaults to TN). */
export const TUNISIA_TZ = "Africa/Tunis";

export function isOpenNow(hours: Hours, now = new Date()): boolean {
  if (hours.alwaysOpen) return true;
  const h = now.getHours();
  return h >= hours.openHour && h < hours.closeHour;
}

/**
 * `isOpenNow` against a fixed zone instead of the local clock. Server renders
 * run on the host's clock (UTC in production), which would read an hour off
 * from the tenant's actual opening hours.
 */
export function isOpenNowIn(
  hours: Hours,
  timeZone: string,
  now = new Date(),
): boolean {
  if (hours.alwaysOpen) return true;
  const h = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "numeric",
      hourCycle: "h23",
    }).format(now),
  );
  return h >= hours.openHour && h < hours.closeHour;
}

/**
 * When a closed shop opens again.
 *
 * State, not a sentence. This module used to return "Fermé — réouverture
 * demain à 8h" fully assembled, which left UI text in a pure library and hard-
 * coded the French "8h" hour format; the caller now renders it from messages.
 */
export type ClosedState = {
  /** Past closing time, so the next opening is tomorrow rather than later today. */
  reopensTomorrow: boolean;
  openHour: number;
};

export function closedState(hours: Hours, now = new Date()): ClosedState {
  return {
    reopensTomorrow: now.getHours() >= hours.closeHour,
    openHour: hours.openHour,
  };
}
