/**
 * Why a driver turned a course down.
 *
 * Suggestions rather than a blank box, for two reasons: a driver on a scooter
 * will not type, and a free-text field produces fifty spellings of the same
 * thing that nobody can count. "Autre" stays, because a fixed list always
 * misses something — and that is exactly the answer worth reading.
 *
 * Kept in lockstep with the order_declines_reason_check constraint (0018).
 */
export const DECLINE_REASONS = [
  "too_far",
  "busy",
  "shop_closed",
  "fee_too_low",
  "end_of_shift",
  "other",
] as const;

export type DeclineReason = (typeof DECLINE_REASONS)[number];

export function isDeclineReason(v: unknown): v is DeclineReason {
  return (
    typeof v === "string" && (DECLINE_REASONS as readonly string[]).includes(v)
  );
}

/** "other" is the only one where the written note carries the meaning. */
export function requiresNote(reason: DeclineReason): boolean {
  return reason === "other";
}
