// ============================================================
// Geo / delivery-zone math — pure, parameterized by a tenant's Zone.
// Straight-line (haversine): needs no API call, runs the instant the
// customer shares their position. The zone verdict is final; the fee is
// an estimate refined by the road-distance quote (see /api/quote).
// ============================================================

import type { LatLng } from "@/lib/order-types";
import type { FeeConfig, Zone } from "@/lib/config-types";
import { feeForKm } from "@/lib/fees";

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function zoneCenter(zone: Zone): LatLng {
  return { lat: zone.centerLat, lng: zone.centerLng };
}

export type ZoneResult =
  | { inZone: true; distanceKm: number; fee: number }
  | { inZone: false };

/** Zone + estimated fee from a coordinate alone (straight-line). */
export function evaluatePosition(pos: LatLng, zone: Zone, fee: FeeConfig): ZoneResult {
  const distanceKm = haversineKm(zoneCenter(zone), pos);
  if (distanceKm > zone.radiusKm) return { inZone: false };
  return {
    inZone: true,
    distanceKm: Math.max(0.5, distanceKm),
    fee: feeForKm(distanceKm, fee),
  };
}

/** True when a coordinate is inside the tenant's delivery zone. */
export function isInZone(pos: LatLng, zone: Zone): boolean {
  return haversineKm(zoneCenter(zone), pos) <= zone.radiusKm;
}

/** Fallback position inside the zone (used when geolocation is unavailable). */
export function simulatedPosition(zone: Zone): LatLng {
  // ~3 km offset from the center, always in zone — keeps the happy path working.
  return { lat: zone.centerLat + 0.025, lng: zone.centerLng + 0.012 };
}
