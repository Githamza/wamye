// ============================================================
// Delivery location configuration (client-safe: NEXT_PUBLIC_ only).
//
// Two modes:
//   "fixed" (default) — the app is pinned to a single country + centre
//     (France / Tours out of the box). Nearby search, the delivery zone and
//     the phone dial code all use these, ignoring the device locale. This is
//     what you want for testing one city.
//   "auto"            — fully dynamic: geolocation on load, reverse-geocoded
//     country, device-locale fallback. Set NEXT_PUBLIC_DELIVERY_MODE=auto.
// ============================================================

/** Tours (Indre-et-Loire) — the default home when nothing is configured. */
const TOURS = { lat: 47.3941, lng: 0.6848 };

function parseCenter(raw: string | undefined): { lat: number; lng: number } | null {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(raw ?? "");
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/** "fixed" (pinned to DELIVERY_COUNTRY/CENTER) or "auto" (GPS + locale). */
export const DELIVERY_MODE = (
  process.env.NEXT_PUBLIC_DELIVERY_MODE ?? "fixed"
).toLowerCase();

export const AUTO_LOCATE = DELIVERY_MODE === "auto";

/** ISO country used for the phone dial code + validation in fixed mode. */
export const DELIVERY_COUNTRY = (
  process.env.NEXT_PUBLIC_DELIVERY_COUNTRY ?? "FR"
).toUpperCase();

/** Home centre used for nearby search + the delivery zone in fixed mode. */
export const DELIVERY_CENTER =
  parseCenter(process.env.NEXT_PUBLIC_DELIVERY_CENTER) ?? TOURS;
