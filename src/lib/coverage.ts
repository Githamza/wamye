// ============================================================
// National coverage — where the livreurs are, seen from the platform.
//
// Shape + grouping only, no I/O: the server loader lives in coverage-data.ts,
// and the map that draws this is a client component.
//
// One row per LIVREUR ACCOUNT (a tenant), which is the unit a launch decision
// is made in: "Ariana has eleven livreurs waiting" means eleven people to call,
// not eleven phones reporting GPS.
// ============================================================

import { GOVERNORATES, type Governorate } from "@/lib/tunisia";

/**
 * How we know where a livreur is — least to most guessed. The UI shows this,
 * because "we have his GPS" and "he typed Ariana at signup" are not the same
 * claim and a map that renders them identically would be lying.
 */
export type PositionSource =
  /** A real fix from the PWA's foreground geolocation loop. */
  | "gps"
  /** A delivery zone centre they actually moved off the signup placeholder. */
  | "zone"
  /** Their free-text work area, matched to a governorate. */
  | "label"
  /** A coordinate outside Tunisia — a tester abroad, not a coverage point. */
  | "abroad"
  /** Nothing usable: no fix, placeholder zone, and an area we cannot read. */
  | "unknown";

export type Livreur = {
  tenantId: string;
  name: string;
  slug: string;
  status: string;
  /** What they typed as their work area, verbatim — shown as-is, never cleaned. */
  areaLabel: string | null;
  phone: string | null;
  createdAt: string;
  memberCount: number;
  source: PositionSource;
  /** The governorate they are counted in; null for abroad/unknown. */
  govKey: string | null;
  /** Further governorates their label named, in the order it named them. */
  alsoGovKeys: string[];
  /** The alias that placed them, so a wrong match is visible, not silent. */
  matched: string | null;
  /** The match needed a forgiven spelling — a guess, flagged as one. */
  fuzzy: boolean;
  /** An exact point, for `gps` / `zone` / `abroad` only. */
  lat: number | null;
  lng: number | null;
  positionAgeMin: number | null;
};

export type Region = {
  gov: Governorate;
  /** Livreurs counted here (their primary area). */
  total: number;
  active: number;
  pending: number;
  suspended: number;
  /** Of the total, how many are placed by a real point rather than by text. */
  precise: number;
  /** Livreurs whose primary area is elsewhere but who also cover this one. */
  also: number;
};

/** Livreurs we could not place at all, split by why. */
export type Unplaced = {
  abroad: Livreur[];
  unknown: Livreur[];
};

export function isPlaced(l: Livreur): boolean {
  return l.govKey !== null;
}

/**
 * Governorates with at least one livreur, biggest first.
 *
 * Empty governorates are dropped rather than listed at zero: the question is
 * where to launch next, and eighteen zeroes push the four answers off screen.
 */
export function groupByGovernorate(livreurs: Livreur[]): Region[] {
  const empty = (gov: Governorate): Region => ({
    gov,
    total: 0,
    active: 0,
    pending: 0,
    suspended: 0,
    precise: 0,
    also: 0,
  });
  const regions = new Map(GOVERNORATES.map((g) => [g.key, empty(g)]));

  for (const l of livreurs) {
    if (l.govKey) {
      const region = regions.get(l.govKey);
      if (region) {
        region.total += 1;
        if (l.status === "active") region.active += 1;
        else if (l.status === "pending") region.pending += 1;
        else region.suspended += 1;
        if (l.source === "gps" || l.source === "zone") region.precise += 1;
      }
    }
    for (const key of l.alsoGovKeys) {
      const region = regions.get(key);
      if (region) region.also += 1;
    }
  }

  return [...regions.values()]
    .filter((r) => r.total > 0 || r.also > 0)
    .sort((a, b) => b.total - a.total || b.also - a.also || a.gov.name.localeCompare(b.gov.name));
}

export function splitUnplaced(livreurs: Livreur[]): Unplaced {
  return {
    abroad: livreurs.filter((l) => l.source === "abroad"),
    unknown: livreurs.filter((l) => l.source === "unknown"),
  };
}

/**
 * Bubble radius in pixels for a count.
 *
 * Square-rooted so the DISC AREA tracks the count: Tunis with 60 livreurs and
 * Sfax with 4 must be comparable at a glance, and a linear radius would make
 * Tunis a blob covering half the country.
 */
export function bubbleRadius(count: number, max: number): number {
  const MIN = 15;
  const MAX = 46;
  if (max <= 0) return MIN;
  return MIN + (MAX - MIN) * Math.sqrt(count / max);
}
