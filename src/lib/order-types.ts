// ============================================================
// Order DTOs — shared between the browser and the API routes.
// No secrets here: safe to import from client components.
// ============================================================

/** Coarse delivery stage that drives the confirm-screen timeline. */
export type OrderStage = "searching" | "enroute" | "delivered" | "canceled";

/** A point on the map. */
export type LatLng = { lat: number; lng: number };

/** What the browser sends to POST /api/quote. */
export type QuoteInput = {
  /** Pickup — the commerce. */
  origin: LatLng;
  /** Dropoff — the customer's pin. */
  destination: LatLng;
};

/** What POST /api/quote returns: the delivery fee and how it was derived. */
export type Quote = {
  distanceKm: number;
  durationMin: number;
  fee: number;
  /**
   * "road"     — real driving distance from the Routes API.
   * "estimate" — straight-line fallback (no commerce coords, or Maps unconfigured).
   */
  source: "road" | "estimate";
};

/** What the browser sends to POST /api/orders. */
export type CreateOrderInput = {
  order: string;
  commerceName: string;
  commerceAddr?: string | null;
  /** Pickup coordinates, when the commerce came from Google Places. */
  commercePosition?: LatLng | null;
  repere?: string;
  /** National digits as typed, e.g. "0612345678" (FR) or "4155551234" (US). */
  phone: string;
  /** ISO 3166-1 alpha-2 country of the phone number, e.g. "FR". Drives E.164. */
  country: string;
  prenom?: string;
  fee: number | null;
  distanceKm: number | null;
  /** How `fee`/`distanceKm` were derived — road distance or straight-line estimate. */
  quoteSource?: "road" | "estimate";
  position: LatLng | null;
};

/** What POST /api/orders returns once the order exists in Fleetbase. */
export type CreatedOrder = {
  /** Fleetbase public id, e.g. "order_xxx". */
  id: string;
  trackingNumber: string | null;
  status: string;
  stage: OrderStage;
};

/** What GET /api/orders/[id] returns while polling for progress. */
export type OrderStatus = {
  id: string;
  status: string;
  stage: OrderStage;
  trackingNumber: string | null;
  driverAssigned: boolean;
};
