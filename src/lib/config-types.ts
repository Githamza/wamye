// ============================================================
// Tenant configuration DTOs — shared between server and browser.
// No secrets here (the Fleetbase key lives server-side only): safe to
// import from client components. A tenant's public config is what drives
// the ordering page — branding, commerce list, delivery zone, fee model,
// opening hours.
// ============================================================

import type { LatLng } from "@/lib/order-types";

/** Circular delivery zone: a center point + radius. */
export type Zone = {
  centerLat: number;
  centerLng: number;
  radiusKm: number;
};

/** Distance-based delivery fee model. */
export type FeeConfig = {
  baseFee: number;
  feePerKm: number;
  minFee: number;
};

/** Opening hours (local time). `alwaysOpen` bypasses the check. */
export type Hours = {
  openHour: number;
  closeHour: number;
  alwaysOpen: boolean;
};

/** Per-tenant look & feel shown on the public ordering page. */
export type Branding = {
  name: string;
  /** Emoji shown in the header avatar (e.g. "🛵"). */
  logoEmoji?: string;
  /** Short area label, e.g. "Djerba & Midoun". */
  areaLabel?: string;
  /** Support number in international form, e.g. "+21622483921". */
  supportPhone?: string;
  primaryColor?: string;
};

/**
 * A pickup business. Coordinates are only present for commerces picked from
 * Google Places; entries without them fall back to the straight-line fee.
 */
export type Commerce = {
  id: string;
  name: string;
  addr: string;
  lat?: number;
  lng?: number;
};

/**
 * Everything the public ordering page needs for one tenant. Contains NO
 * secrets — the Fleetbase API key is read server-side only (see tenant.ts).
 */
export type TenantPublicConfig = {
  slug: string;
  branding: Branding;
  zone: Zone;
  feeConfig: FeeConfig;
  hours: Hours;
  /** ISO country for phone validation/formatting, e.g. "TN". */
  phoneCountry: string;
  commerces: Commerce[];
};

export type { LatLng };
