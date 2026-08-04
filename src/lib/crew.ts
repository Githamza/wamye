// ============================================================
// The team, as one driver sees the others.
//
// Shape + presentation rules only, no I/O: the server loader lives in
// crew-data.ts, and the components that read this are client components.
// ============================================================

import type { DriverOrder } from "@/lib/order-types";

/**
 * Past this, a stored fix is not worth drawing on a map.
 *
 * The same thirty minutes eligible_push_targets() uses to decide whether a
 * driver can be dispatched at all (migration 0019). Keeping one number means a
 * greyed-out avatar says something exact: dispatch would not reach this person
 * either.
 */
export const POSITION_FRESH_MINUTES = 30;

/** One teammate, with whatever they are doing right now attached. */
export type CrewMember = {
  id: string;
  name: string | null;
  /** The reader themselves — shown first, and never worth calling. */
  isMe: boolean;
  lat: number | null;
  lng: number | null;
  /**
   * Minutes since their last fix, null when there has never been one.
   *
   * Computed on the server and carried as a number: deriving it in the browser
   * from a timestamp would render one value on the server and another on
   * hydration, which React reports as a mismatch.
   */
  positionAgeMin: number | null;
  /** Fresh enough to draw. Server-computed, for the same reason. */
  positionFresh: boolean;
  /** The course they are on, or null when they are free. */
  order: DriverOrder | null;
};

/**
 * Up to two letters for the avatar.
 *
 * Wamye stores one free-text name, so "Karim Ben Ali" gives KB and a mononym
 * gives its first letter. Arabic names work unchanged — these are code points,
 * not ASCII.
 */
export function initials(name: string | null): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return [...words[0]].slice(0, 1).join("").toUpperCase();
  return [...words[0]][0].toUpperCase() + [...words[1]][0].toUpperCase();
}

/**
 * A stable colour per person, so the same driver is the same colour on the
 * stack, in the list and on the map. Hashed from the id rather than stored:
 * one less column to keep in sync, and ids never change.
 */
const AVATAR_TINTS = [
  "#0F766E", // brand
  "#B45309",
  "#6D28D9",
  "#B91C1C",
  "#1D4ED8",
  "#047857",
] as const;

export function avatarTint(id: string): string {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) % 100_000;
  return AVATAR_TINTS[hash % AVATAR_TINTS.length];
}

/** Drivers whose last fix is worth putting on a map. */
export function mappable(crew: CrewMember[]): CrewMember[] {
  return crew.filter((m) => m.lat != null && m.lng != null);
}
