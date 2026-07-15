// ============================================================
// Delivery fee math — pure, parameterized by a tenant's FeeConfig.
// Shared by the client's straight-line estimate and the server's
// authoritative road-distance quote so the two can never drift apart.
// ============================================================

import type { FeeConfig } from "@/lib/config-types";

export function roundToHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

/** The delivery fee for a given distance under a tenant's fee model. */
export function feeForKm(distanceKm: number, fee: FeeConfig): number {
  return Math.max(fee.minFee, roundToHalf(fee.baseFee + fee.feePerKm * distanceKm));
}

/** Tunisian-style number formatting: comma decimal separator. */
export function formatDT(n: number): string {
  return n.toFixed(1).replace(".", ",");
}
