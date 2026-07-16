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

export function closedLabel(hours: Hours, now = new Date()): string {
  const afterClose = now.getHours() >= hours.closeHour;
  return afterClose
    ? `Fermé — réouverture demain à ${hours.openHour}h`
    : `Fermé — réouverture à ${hours.openHour}h`;
}

export function openLabel(hours: Hours): string {
  return `Ouvert jusqu'à ${hours.closeHour}h`;
}
