// ============================================================
// Livraison Djerba — domain logic
// ============================================================

export type Commerce = {
  id: string;
  name: string;
  addr: string;
};

export const COMMERCES: Commerce[] = [
  { id: "ali", name: "Chez Ali", addr: "Av. Habib Bourguiba, Midoun" },
  { id: "hamadi", name: "Chez Hamadi — Grillades", addr: "Route de la plage, Djerba Houmt Souk" },
  { id: "salem", name: "Chez Salem — Épicerie", addr: "Rue de la Liberté, Midoun" },
  { id: "farhat", name: "Pâtisserie Farhat", addr: "Place Sidi Mahrez, Houmt Souk" },
  { id: "pharma", name: "Pharmacie de la Corniche", addr: "Av. de la Corniche, Aghir" },
  { id: "monoprix", name: "Monoprix Djerba", addr: "Zone touristique, Midoun" },
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

export function isOpenNow(now = new Date()): boolean {
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
  return `Ouvert jusqu'à ${CLOSE_HOUR}h · Djerba & Midoun`;
}

// ---- Fees & delivery zone --------------------------------------
// Midoun / Djerba reference point.
const DJERBA = { lat: 33.808, lng: 10.995 };
const ZONE_RADIUS_KM = 22; // covers the whole island + Midoun
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

/** Tunisian number formatting: comma decimal separator. */
export function formatDT(n: number): string {
  return n.toFixed(1).replace(".", ",");
}

function roundToHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

export type ZoneResult =
  | { inZone: true; distanceKm: number; fee: number }
  | { inZone: false };

/** Given a real (or simulated) coordinate, decide zone + fee. */
export function evaluatePosition(pos: { lat: number; lng: number }): ZoneResult {
  const distanceKm = haversineKm(DJERBA, pos);
  if (distanceKm > ZONE_RADIUS_KM) return { inZone: false };
  const fee = Math.max(MIN_FEE, roundToHalf(BASE_FEE + FEE_PER_KM * distanceKm));
  return { inZone: true, distanceKm: Math.max(0.5, distanceKm), fee };
}

/** Fallback position inside Djerba (used when geolocation is unavailable). */
export function simulatedDjerbaPosition(): { lat: number; lng: number } {
  // ~3.2 km from the reference point, always in zone — keeps the happy path working.
  return { lat: DJERBA.lat + 0.025, lng: DJERBA.lng + 0.012 };
}

// ---- Phone validation ------------------------------------------
export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 8);
}

export function isValidPhone(raw: string): boolean {
  const digits = normalizePhone(raw);
  return digits.length === 8 && /^[2459]/.test(digits);
}

export function formatPhone(raw: string): string {
  const d = normalizePhone(raw);
  // 22 483 921
  return [d.slice(0, 2), d.slice(2, 5), d.slice(5, 8)].filter(Boolean).join(" ");
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
