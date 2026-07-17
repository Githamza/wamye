// ============================================================
// Google Maps — BROWSER side.
//
// Holds the *referrer-restricted* browser key (NEXT_PUBLIC_*, so it is
// inlined into the client bundle at build time — see Dockerfile). The
// secret server key lives in src/lib/routes.ts and never ships here.
//
// Everything degrades: when no browser key is configured, isMapsEnabled()
// is false and the UI falls back to the mock map + the hardcoded commerce
// list, exactly as the app behaved before Maps was added.
//
// Written against the CURRENT Maps JS API (2026). Note that the APIs most
// code samples still use are Legacy and cannot be enabled on a Google Cloud
// project created after 2025-03-01:
//   - places.Autocomplete / PlacesService → AutocompleteSuggestion + Place
//   - google.maps.Marker                  → AdvancedMarkerElement (needs a Map ID)
// ============================================================

import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import type { LatLng } from "@/lib/order-types";
import type { Zone } from "@/lib/config-types";

const BROWSER_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ?? "";
// Advanced markers refuse to render without a Map ID. Google's public test ID
// works out of the box; set a real one to apply your own cloud map styling.
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID";

/** True when a browser key is configured — callers fall back to the mock otherwise. */
export function isMapsEnabled(): boolean {
  return BROWSER_KEY.trim() !== "";
}

export { MAP_ID };

// Default map centre (fallback for the mini-map before a tenant zone is known).
export const DJERBA_CENTER = { lat: 33.808, lng: 10.995 };

// Keep the search box sane even if a tenant sets a huge radius.
const MAX_RESTRICT_KM = 50;

/** A lat/lng bounding box circumscribing the tenant's circular zone. */
function boundsFromZone(zone: Zone) {
  const km = Math.min(MAX_RESTRICT_KM, Math.max(1, zone.radiusKm));
  const dLat = km / 111.32;
  const dLng = km / (111.32 * Math.cos((zone.centerLat * Math.PI) / 180));
  return {
    west: zone.centerLng - dLng,
    east: zone.centerLng + dLng,
    south: zone.centerLat - dLat,
    north: zone.centerLat + dLat,
  };
}

// The bootstrap loader only ever loads once and warns if re-invoked, so
// configure it at module scope rather than inside an effect (React StrictMode
// and Fast Refresh both run effects twice).
let configured = false;
function configure(): void {
  if (configured || !isMapsEnabled()) return;
  // `language: "fr"` stays fixed, and does not follow the ar-TN locale.
  //
  // Two reasons. Practically, this loader is a module-scope singleton that
  // warns if reconfigured, so it cannot vary per page anyway. And by choice:
  // Tunisian place names are read in Latin script on maps, and Google's Arabic
  // for Tunisia transliterates them into unfamiliar MSA forms — a derja reader
  // looking for "Houmt Souk" would be handed "حومة السوق".
  setOptions({ key: BROWSER_KEY, v: "weekly", language: "fr", region: "TN" });
  configured = true;
}

export type MapsLibs = {
  Map: typeof google.maps.Map;
  AdvancedMarkerElement: typeof google.maps.marker.AdvancedMarkerElement;
};

/** Load the map + marker libraries. Safe to call repeatedly; loads once. */
export async function loadMapLibs(): Promise<MapsLibs> {
  configure();
  const [{ Map }, { AdvancedMarkerElement }] = await Promise.all([
    importLibrary("maps"),
    importLibrary("marker"),
  ]);
  return { Map, AdvancedMarkerElement };
}

/** AdvancedMarkerElement.position is a union; flatten it to a plain lat/lng. */
export function readMarkerPosition(
  marker: google.maps.marker.AdvancedMarkerElement,
): { lat: number; lng: number } | null {
  const p = marker.position;
  if (!p) return null;
  return typeof p.lat === "function"
    ? { lat: (p as google.maps.LatLng).lat(), lng: (p as google.maps.LatLng).lng() }
    : { lat: p.lat as number, lng: p.lng as number };
}

// ---- Places autocomplete ---------------------------------------
//
// Billing: keystrokes + the follow-up details call are billed as ONE session
// only while they share a session token. fetchFields() spends the token, so a
// fresh one must be minted for the next search — otherwise every keystroke is
// billed individually.

export type PlaceSuggestion = {
  placeId: string;
  /** Business name, e.g. "Chez Ali". */
  name: string;
  /** Address line under it. */
  secondary: string;
  /** Distance from the search origin (customer), when known — for nearest-first. */
  distanceMeters?: number;
  prediction: google.maps.places.PlacePrediction;
};

/** Options that make commerce search location-aware and tenant-scoped. */
export type NearbySearch = {
  /** Tenant delivery zone — hard-restricts results to the deliverable area. */
  zone: Zone;
  /** Customer position, when known — results are ranked nearest-first from here. */
  origin?: LatLng | null;
  /** ISO region code (e.g. "tn"), derived from the tenant's phoneCountry. */
  regionCode?: string;
};

/** Resolved commerce: what the order actually needs. */
export type PlaceDetails = {
  placeId: string;
  name: string;
  addr: string;
  lat: number;
  lng: number;
};

let sessionToken: google.maps.places.AutocompleteSessionToken | null = null;

async function placesLib() {
  configure();
  return importLibrary("places");
}

/**
 * Live commerce search, hard-restricted to the tenant's delivery zone and
 * ranked nearest-first from the customer's position (falling back to the zone
 * centre until they share it). A shop outside the zone is undeliverable, so it
 * is filtered out, not merely down-ranked.
 */
export async function searchPlaces(
  input: string,
  opts: NearbySearch,
): Promise<PlaceSuggestion[]> {
  const q = input.trim();
  if (q === "" || !isMapsEnabled()) return [];

  const { AutocompleteSuggestion, AutocompleteSessionToken } = await placesLib();
  if (!sessionToken) sessionToken = new AutocompleteSessionToken();

  const zoneCenter = { lat: opts.zone.centerLat, lng: opts.zone.centerLng };
  const origin = opts.origin ?? zoneCenter;

  const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input: q,
    sessionToken,
    // Restrict (not just bias) to the deliverable zone.
    locationRestriction: boundsFromZone(opts.zone),
    // Distance is measured from here → nearest shops surface first.
    origin,
    ...(opts.regionCode ? { includedRegionCodes: [opts.regionCode] } : {}),
    // Matches the loader's fixed language — see configure() for why the map
    // and its place names stay French even for a derja reader.
    language: "fr",
  });

  return suggestions
    .map((s) => s.placePrediction)
    .filter((p): p is google.maps.places.PlacePrediction => p != null)
    .map((p) => ({
      placeId: p.placeId,
      name: p.mainText?.text ?? p.text.text,
      secondary: p.secondaryText?.text ?? "",
      distanceMeters: p.distanceMeters ?? undefined,
      prediction: p,
    }))
    .sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity))
    .slice(0, 5);
}

/**
 * Turn a picked suggestion into coordinates.
 *
 * Only `formattedAddress` + `location` are requested: both are Essentials-tier
 * fields. Asking for `displayName` would promote the call to Pro tier (~3x the
 * price) for a name we already have for free in the prediction's mainText.
 */
export async function resolvePlace(s: PlaceSuggestion): Promise<PlaceDetails> {
  const place = s.prediction.toPlace();
  await place.fetchFields({ fields: ["formattedAddress", "location"] });

  // fetchFields() closed the billing session — the next search needs a new token.
  sessionToken = null;

  const loc = place.location;
  if (!loc) throw new Error("Place has no location");

  return {
    placeId: s.placeId,
    name: s.name,
    addr: place.formattedAddress ?? s.secondary,
    lat: loc.lat(),
    lng: loc.lng(),
  };
}
