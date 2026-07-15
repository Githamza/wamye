// ============================================================
// Opening-hours logic — pure, parameterized by a tenant's Hours.
// ============================================================

import type { Hours } from "@/lib/config-types";

export function isOpenNow(hours: Hours, now = new Date()): boolean {
  if (hours.alwaysOpen) return true;
  const h = now.getHours();
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
