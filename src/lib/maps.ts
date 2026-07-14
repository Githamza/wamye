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

// Tours: city centre, and a hard bounding box for Places results
// (covers Tours + the immediate agglomération).
export const TOURS_CENTER = { lat: 47.3941, lng: 0.6848 };
const TOURS_BOUNDS = { west: 0.55, south: 47.30, east: 0.80, north: 47.48 };

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

/** Live commerce search, hard-restricted to the Tours bounding box. */
export async function searchPlaces(input: string): Promise<PlaceSuggestion[]> {
  const q = input.trim();
  if (q === "" || !isMapsEnabled()) return [];

  const { AutocompleteSuggestion, AutocompleteSessionToken } = await placesLib();
  if (!sessionToken) sessionToken = new AutocompleteSessionToken();

  const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input: q,
    sessionToken,
    // Restrict (not just bias): a commerce outside Tours is undeliverable.
    locationRestriction: TOURS_BOUNDS,
    origin: TOURS_CENTER,
    includedRegionCodes: ["fr"],
    language: "fr",
    region: "fr",
  });

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
