// ============================================================
// Google Routes API — SERVER ONLY.
//
// Holds the secret server key (no NEXT_PUBLIC_ prefix, so it is never
// shipped to the browser). Never import this from a client component; it
// is only used by the route handler at src/app/api/quote.
//
// Computes real ROAD distance commerce → customer, which is what the
// delivery fee is based on. The browser must not compute this: a client
// could forge a short distance and pay a smaller fee.
//
// Uses Routes API `computeRoutes`. The Distance Matrix and Directions APIs
// that older code samples use went Legacy on 2025-03-01 and cannot be
// enabled on a new Google Cloud project.
// ============================================================

const ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes";

const SERVER_KEY = process.env.GOOGLE_MAPS_SERVER_KEY ?? "";

export class RoutesError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "RoutesError";
  }
}

/** True when a server key is configured — the route can 503 cleanly otherwise. */
export function isConfigured(): boolean {
  return SERVER_KEY.trim() !== "";
}

export type LatLng = { lat: number; lng: number };

export type DriveLeg = {
  distanceKm: number;
  durationMin: number;
};

type RoutesResponse = {
  routes?: { distanceMeters?: number; duration?: string }[];
  error?: { message?: string };
};

function waypoint(p: LatLng) {
  return { location: { latLng: { latitude: p.lat, longitude: p.lng } } };
}

/**
 * Driving distance + duration between two points.
 *
 * Returns null when Google finds no drivable route (an empty `routes` array
 * comes back as HTTP 200, so it must be handled explicitly).
 */
export async function computeDriveLeg(
  origin: LatLng,
  destination: LatLng,
): Promise<DriveLeg | null> {
  if (!isConfigured()) {
    throw new RoutesError("Google Maps server key is not configured", 503);
  }

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": SERVER_KEY,
        // Mandatory. Asking for only these two keeps the response small and
        // the request on the cheapest billing tier.
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters",
      },
      body: JSON.stringify({
        origin: waypoint(origin),
        destination: waypoint(destination),
        travelMode: "DRIVE",
        // routingPreference is deliberately omitted: TRAFFIC_AWARE would
        // promote this call from the Essentials tier to Pro (~3x the price)
        // for an accuracy gain that does not change a rounded delivery fee.
        computeAlternativeRoutes: false,
        languageCode: "fr-FR",
        units: "METRIC",
      }),
    });
  } catch (cause) {
    throw new RoutesError(
      `Cannot reach the Routes API: ${(cause as Error).message}`,
      502,
    );
  }

  const body = (await res.json().catch(() => ({}))) as RoutesResponse;

  if (!res.ok) {
    throw new RoutesError(
      body.error?.message || `Routes request failed (${res.status})`,
      res.status,
    );
  }

  const route = body.routes?.[0];
  if (!route?.distanceMeters) return null;

  return {
    distanceKm: route.distanceMeters / 1000,
    // `duration` is a string with a trailing "s", e.g. "165s".
    durationMin: Math.max(1, Math.round(parseInt(route.duration ?? "0", 10) / 60)),
  };
}
