// ============================================================
// Livraison Tours — domain logic
// ============================================================

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

export const COMMERCES: Commerce[] = [
  { id: "bigard", name: "Chez Bigard — Grillades", addr: "Rue Colbert, Tours" },
  { id: "leon", name: "Léon de Tours — Bistrot", addr: "Place Plumereau, Tours" },
  { id: "primeur", name: "Le Primeur du Vieux Tours", addr: "Rue du Grand Marché, Tours" },
  { id: "briand", name: "Boulangerie Briand", addr: "Av. de Grammont, Tours" },
  { id: "pharma", name: "Pharmacie de la Loire", addr: "Quai d'Orléans, Tours" },
  { id: "monoprix", name: "Monoprix Tours Centre", addr: "Rue Nationale, Tours" },
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
  return `Ouvert jusqu'à ${CLOSE_HOUR}h · Tours & agglomération`;
}

// ---- Fees & delivery zone --------------------------------------
// Tours (Indre-et-Loire) reference point — place Jean Jaurès.
const TOURS = { lat: 47.3941, lng: 0.6848 };
const ZONE_RADIUS_KM = 15; // covers Tours + agglomération (Joué, Saint-Cyr, Saint-Avertin…)
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
 * Decide zone + estimated fee from a coordinate alone.
 *
 * Straight-line, so it needs no API call and no commerce: it runs the instant
 * the customer shares their position. The zone verdict is final; the fee is
 * only an estimate, refined by the road-distance quote once a commerce with
 * coordinates is known (see POST /api/quote).
 */
export function evaluatePosition(pos: { lat: number; lng: number }): ZoneResult {
  const distanceKm = haversineKm(TOURS, pos);
  if (distanceKm > ZONE_RADIUS_KM) return { inZone: false };
  return { inZone: true, distanceKm: Math.max(0.5, distanceKm), fee: feeForKm(distanceKm) };
}

/** True when a coordinate is inside the delivery zone. Used server-side too. */
export function isInZone(pos: { lat: number; lng: number }): boolean {
  return haversineKm(TOURS, pos) <= ZONE_RADIUS_KM;
}

/** Fallback position inside Tours (used when geolocation is unavailable). */
export function simulatedToursPosition(): { lat: number; lng: number } {
  // ~2.9 km from the reference point, always in zone — keeps the happy path working.
  return { lat: TOURS.lat + 0.02, lng: TOURS.lng + 0.015 };
}

// ---- Phone validation ------------------------------------------
// French numbers: 10 digits with a leading 0 (e.g. 06 12 34 56 78).
export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 10);
}

export function isValidPhone(raw: string): boolean {
  const digits = normalizePhone(raw);
  // 10 digits, leading 0, then a valid area/mobile prefix 1-9.
  return digits.length === 10 && /^0[1-9]/.test(digits);
}

export function formatPhone(raw: string): string {
  const d = normalizePhone(raw);
  // 06 12 34 56 78 — groups of two.
  return (d.match(/.{1,2}/g) ?? []).join(" ");
}

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
