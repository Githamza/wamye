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

const BROWSER_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ?? "";
// Advanced markers refuse to render without a Map ID. Google's public test ID
// works out of the box; set a real one to apply your own cloud map styling.
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID";

/** True when a browser key is configured — callers fall back to the mock otherwise. */
export function isMapsEnabled(): boolean {
  return BROWSER_KEY.trim() !== "";
}

export { MAP_ID };

// Last-resort map centre, only used when the customer's position is unknown
// (geolocation denied and no pin yet). Everything real is driven by the live
// GPS position instead — see searchPlaces() and MiniMap.
export const DEFAULT_CENTER = { lat: 47.3941, lng: 0.6848 };

// How far around the customer to look for deliverable commerces.
const NEARBY_RADIUS_M = 15_000;

// The bootstrap loader only ever loads once and warns if re-invoked, so
// configure it at module scope rather than inside an effect (React StrictMode
// and Fast Refresh both run effects twice).
let configured = false;
function configure(): void {
  if (configured || !isMapsEnabled()) return;
  setOptions({ key: BROWSER_KEY, v: "weekly", language: "fr", region: "FR" });
  configured = true;
}

export type MapsLibs = {
  Map: typeof google.maps.Map;
  AdvancedMarkerElement: typeof google.maps.marker.AdvancedMarkerElement;
};

/**
 * Reverse-geocode a coordinate to its ISO country code (e.g. "FR"), so the
 * phone input's dial code and validation can follow the customer's location.
 * Returns null when Maps is unconfigured or Google returns no country — the
 * caller then falls back to the device locale.
 */
export async function reverseGeocodeCountry(pos: {
  lat: number;
  lng: number;
}): Promise<string | null> {
  if (!isMapsEnabled()) return null;
  try {
    configure();
    const { Geocoder } = await importLibrary("geocoding");
    const { results } = await new Geocoder().geocode({ location: pos });
    for (const result of results) {
      const country = result.address_components.find((c) =>
        c.types.includes("country"),
      );
      if (country?.short_name) return country.short_name.toUpperCase();
    }
    return null;
  } catch (err) {
    console.error("[maps] reverse geocode failed:", err);
    return null;
  }
}

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
  prediction: google.maps.places.PlacePrediction;
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

export type NearbyOptions = {
  /** The customer's position — search is biased here and ranked by distance. */
  center?: { lat: number; lng: number } | null;
  /** ISO country code (e.g. "FR") to keep results in the customer's country. */
  countryCode?: string | null;
};

/**
 * Live commerce search, biased to the customer's location so the nearest
 * restaurants/shops surface first. When no position is known yet the search
 * stays broad (optionally constrained to the detected country).
 */
export async function searchPlaces(
  input: string,
  { center, countryCode }: NearbyOptions = {},
): Promise<PlaceSuggestion[]> {
  const q = input.trim();
  if (q === "" || !isMapsEnabled()) return [];

  const { AutocompleteSuggestion, AutocompleteSessionToken } = await placesLib();
  if (!sessionToken) sessionToken = new AutocompleteSessionToken();

  const params: google.maps.places.AutocompleteRequest = {
    input: q,
    sessionToken,
    language: "fr",
  };
  // Bias (not restrict) to a circle around the customer, and set the origin so
  // suggestions come back ranked by straight-line distance from them.
  if (center) {
    params.locationBias = { center, radius: NEARBY_RADIUS_M };
    params.origin = center;
  }
  // Keep results in-country when we know it — avoids proposing an undeliverable
  // shop across a nearby border.
  if (countryCode) {
    params.includedRegionCodes = [countryCode.toLowerCase()];
    params.region = countryCode.toLowerCase();
  }

  const { suggestions } =
    await AutocompleteSuggestion.fetchAutocompleteSuggestions(params);

  return suggestions
    .map((s) => s.placePrediction)
    .filter((p): p is google.maps.places.PlacePrediction => p != null)
    .map((p) => ({
      placeId: p.placeId,
      name: p.mainText?.text ?? p.text.text,
      secondary: p.secondaryText?.text ?? "",
      prediction: p,
    }))
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
