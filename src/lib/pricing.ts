import "server-only";

import {
  computeDriveLeg,
  isConfigured as routesConfigured,
} from "@/lib/routes";
import { feeForKm } from "@/lib/fees";
import { haversineKm } from "@/lib/geo";
import type { FeeConfig } from "@/lib/config-types";
import type { LatLng } from "@/lib/order-types";

/**
 * The authoritative price of a course.
 *
 * The browser sends `fee` and `distanceKm`, and the server used to store them
 * verbatim. It does not any more: the `orders` row IS the order, and that
 * number is what the driver gets paid. A money field must never be
 * client-supplied.
 *
 * Same math as the browser's estimate — feeForKm over the tenant's FeeConfig —
 * so an honest client sees no difference. It is only a forged one that does.
 */

export type PricedLeg = {
  distanceKm: number;
  fee: number;
  source: "road" | "estimate";
};

export async function priceCourse(
  pickup: LatLng,
  dropoff: LatLng | null,
  feeConfig: FeeConfig,
): Promise<PricedLeg> {
  // No customer pin: nothing to measure against, so charge the floor rather
  // than guess. Rare — the order form asks for a position.
  if (!dropoff) {
    return { distanceKm: 0, fee: feeForKm(0, feeConfig), source: "estimate" };
  }

  if (routesConfigured()) {
    try {
      const leg = await computeDriveLeg(pickup, dropoff);
      if (leg) {
        return {
          distanceKm: leg.distanceKm,
          fee: feeForKm(leg.distanceKm, feeConfig),
          source: "road",
        };
      }
    } catch (err) {
      // Google down or over quota must not block an order; fall through to the
      // straight-line estimate, which is what the browser shows anyway.
      console.error("[pricing] road distance failed:", (err as Error).message);
    }
  }

  const straight = Math.max(0.5, haversineKm(pickup, dropoff));
  return {
    distanceKm: straight,
    fee: feeForKm(straight, feeConfig),
    source: "estimate",
  };
}
