// ============================================================
// Livraison — domain logic
// ============================================================

import { DELIVERY_CENTER } from "@/lib/config";

export type Commerce = {
  id: string;
  name: string;
  addr: string;
  /**
   * Pickup coordinates. Only present for commerces picked from Google Places;
   * the hardcoded fallback list below has none, so orders sourced from it fall
   * back to the straight-line fee estimate.
   */
  lat?: number;
  lng?: number;
};

// Generic offline fallback, shown only when Google Maps is not configured. With
// a Maps key, the live location-biased Places search replaces this entirely.
export const COMMERCES: Commerce[] = [
  { id: "grill", name: "Le Grill du Coin — Grillades", addr: "Rue principale" },
  { id: "bistrot", name: "Bistrot Central", addr: "Place du marché" },
  { id: "primeur", name: "Le Primeur du Quartier", addr: "Rue du Commerce" },
  { id: "boulangerie", name: "Boulangerie du Coin", addr: "Avenue de la Gare" },
  { id: "pharma", name: "Pharmacie Centrale", addr: "Grande Rue" },
  { id: "epicerie", name: "Épicerie du Marché", addr: "Boulevard de la République" },
];

export function searchCommerces(query: string): Commerce[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return COMMERCES.filter(
    (c) => c.name.toLowerCase().includes(q) || c.addr.toLowerCase().includes(q),
  ).slice(0, 5);
}

// ---- Opening hours (local time) --------------------------------
export const OPEN_HOUR = 11;
export const CLOSE_HOUR = 23;

// Bypasses the hours check so the order flow can be exercised at any time.
const ALWAYS_OPEN = process.env.NEXT_PUBLIC_ALWAYS_OPEN === "true";

export function isOpenNow(now = new Date()): boolean {
  if (ALWAYS_OPEN) return true;
  const h = now.getHours();
  return h >= OPEN_HOUR && h < CLOSE_HOUR;
}

export function closedLabel(now = new Date()): string {
  const afterClose = now.getHours() >= CLOSE_HOUR;
  return afterClose
    ? `Fermé — réouverture demain à ${OPEN_HOUR}h`
    : `Fermé — réouverture à ${OPEN_HOUR}h`;
}

export function openLabel(): string {
  return `Ouvert jusqu'à ${CLOSE_HOUR}h · Livraison près de vous`;
}

// ---- Fees & delivery zone --------------------------------------
// In "auto" mode the zone is centred on the customer's first GPS fix; this
// configured centre (France / Tours by default) is the fallback, and the
// pinned home in "fixed" mode.
export const DEFAULT_CENTER = DELIVERY_CENTER;
const ZONE_RADIUS_KM = 15; // how far the pin may drift from the customer's area
/** Longest commerce→customer road distance we will deliver. */
export const MAX_DELIVERY_KM = ZONE_RADIUS_KM;
const BASE_FEE = 2.5;
const FEE_PER_KM = 0.6;
const MIN_FEE = 3;

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
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

/** French number formatting: comma decimal separator (e.g. "3,5"). */
export function formatDT(n: number): string {
  return n.toFixed(1).replace(".", ",");
}

function roundToHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

/**
 * The delivery fee for a given distance. Shared by the client's straight-line
 * estimate and the server's authoritative road-distance quote so the two can
 * never drift apart.
 */
export function feeForKm(distanceKm: number): number {
  return Math.max(MIN_FEE, roundToHalf(BASE_FEE + FEE_PER_KM * distanceKm));
}

export type ZoneResult =
  | { inZone: true; distanceKm: number; fee: number }
  | { inZone: false };

/**
 * Decide zone + estimated fee for a pin, relative to the customer's own area
 * (`center` — their first GPS fix). Straight-line, so it needs no API call and
 * no commerce: it runs the instant the customer shares their position. The zone
 * verdict is final; the fee is only an estimate, refined by the road-distance
 * quote once a commerce with coordinates is known (see POST /api/quote).
 */
export function evaluatePosition(
  pos: { lat: number; lng: number },
  center: { lat: number; lng: number } = DEFAULT_CENTER,
): ZoneResult {
  const distanceKm = haversineKm(center, pos);
  if (distanceKm > ZONE_RADIUS_KM) return { inZone: false };
  return { inZone: true, distanceKm: Math.max(0.5, distanceKm), fee: feeForKm(distanceKm) };
}

/** True when a pin is within the delivery radius of the customer's area. */
export function isInZone(
  pos: { lat: number; lng: number },
  center: { lat: number; lng: number } = DEFAULT_CENTER,
): boolean {
  return haversineKm(center, pos) <= ZONE_RADIUS_KM;
}

/** Fallback position (used when geolocation is denied/unavailable). */
export function fallbackPosition(): { lat: number; lng: number } {
  // ~2.9 km from the fallback centre, always in zone — keeps the happy path working.
  return { lat: DEFAULT_CENTER.lat + 0.02, lng: DEFAULT_CENTER.lng + 0.015 };
}

// Phone validation/formatting is country-aware and lives in ./phone.

// ---- Persistence (returning customer + course counter) ---------
const LAST_KEY = "ld:last-order";
const COURSE_KEY = "ld:course-seq";

export type LastOrder = {
  order: string;
  commerceId: string | null;
  commerceName: string;
  phone: string;
  prenom: string;
};

export function loadLastOrder(): LastOrder | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LAST_KEY);
    return raw ? (JSON.parse(raw) as LastOrder) : null;
  } catch {
    return null;
  }
}

export function saveLastOrder(o: LastOrder): void {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(o));
  } catch {
    /* ignore */
  }
}

export function nextCourseNumber(): number {
  if (typeof window === "undefined") return 47;
  try {
    const cur = Number(localStorage.getItem(COURSE_KEY) ?? "46");
    const next = (Number.isFinite(cur) ? cur : 46) + 1;
    localStorage.setItem(COURSE_KEY, String(next));
    return next;
  } catch {
    return 47;
  }
}
