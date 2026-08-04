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

/**
 * What the delivery costs before any address is known — the fee at zero
 * distance, which is the floor of the model.
 *
 * `flat` says whether that floor is also the ceiling: with no per-kilometre
 * component the price is simply the price, and announcing it as "from" would
 * make a fixed fee sound negotiable.
 */
export function startingFee(fee: FeeConfig): { amount: number; flat: boolean } {
  return { amount: feeForKm(0, fee), flat: fee.feePerKm === 0 };
}
