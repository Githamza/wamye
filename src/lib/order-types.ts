// ============================================================
// Order DTOs — shared between the browser and the API routes.
// No secrets here: safe to import from client components.
// ============================================================

/** Coarse delivery stage that drives the confirm-screen timeline. */
export type OrderStage = "searching" | "enroute" | "delivered" | "canceled";

/**
 * Why an API call failed.
 *
 * A code, not a sentence. These routes are public and sit outside the proxy's
 * matcher, so they have no locale to word an error in; the browser knows which
 * language the reader asked for and does it there. Mirrors how the server
 * actions in @/lib/actions report failure.
 *
 * Every value has a message under the "ApiError" namespace in src/messages.
 */
export type ApiErrorCode =
  | "routing-unavailable"
  | "bad-request"
  | "bad-coordinates"
  | "out-of-zone"
  | "no-route"
  | "routing-failed"
  | "incomplete-order"
  | "commerce-not-located"
  | "orders-unavailable"
  | "too-many-orders"
  | "create-failed"
  | "tracking-unavailable";

/** The shape every API route returns on failure. */
export type ApiErrorBody = { error: ApiErrorCode };

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
  /** Google place id of the pickup, when the shop was picked from the list. */
  commercePlaceId?: string | null;
  /**
   * Pickup coordinates. Required, and never inferred server-side.
   *
   * Fleetbase geocodes a pickup that arrives without a location, using the
   * street string alone. When that string is just a shop name it lands
   * anywhere on earth — we had live orders whose pickup resolved to Tennessee
   * — and the order is then invisible to every driver, since adhoc matching is
   * a radius around the pickup point. So the browser must send a resolved
   * Google Place, or the order is refused.
   */
  commercePosition: LatLng;
  repere?: string;
  /** 8 local digits, e.g. "22483921". */
  phone: string;
  prenom?: string;
  fee: number | null;
  distanceKm: number | null;
  /** How `fee`/`distanceKm` were derived — road distance or straight-line estimate. */
  quoteSource?: "road" | "estimate";
  position: LatLng | null;
};

/** What POST /api/orders returns once the order exists. */
export type CreatedOrder = {
  /** Fleetbase public id, e.g. "order_xxx". Becomes the Supabase uuid at cutover. */
  id: string;
  trackingNumber: string | null;
  status: string;
  stage: OrderStage;
  /**
   * Unguessable capability for the customer's tracking page. It IS the
   * authorisation: /api/track/[token] needs nothing else, and there is no id to
   * enumerate. Absent only on the legacy no-tenant path.
   */
  trackingToken?: string;
};

/** What GET /api/track/[token] returns — a projection, never the row. */
export type TrackedOrder = {
  stage: OrderStage;
  state: string;
  trackingNumber: string | null;
  commerceName: string | null;
  fee: number | null;
  /** First name only: enough to recognise the driver, not to identify them. */
  driverName: string | null;
  /** Present while the course is running and the fix is fresh. */
  driver: { lat: number; lng: number; at: string } | null;
  pickup: LatLng | null;
  dropoff: LatLng | null;
  /** Short-lived signed URL, only once delivered. */
  proofUrl: string | null;
};

/**
 * A course as the driver PWA sees it. Selected straight from `orders` through
 * RLS (orders_select_tenant), so the column names are the DB's on purpose —
 * this crosses the Realtime boundary, where payloads arrive as raw rows.
 */
export type DriverOrder = {
  id: string;
  state: string;
  created_at: string;
  commerce_name: string | null;
  commerce_addr: string | null;
  commerce_place_id: string | null;
  order_text: string | null;
  repere: string | null;
  phone: string | null;
  customer_name: string | null;
  fee: number | null;
  distance_km: number | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  driver_id: string | null;
};

/**
 * A Fleetbase order's status, as read by fleetbase.ts `getOrder`.
 *
 * No longer served over HTTP: GET /api/orders/[id] was deleted — it proxied
 * Fleetbase with no ownership check, so any id was readable by anyone.
 * /api/track/[token] replaced it. This type survives only until the cutover
 * removes the Fleetbase client itself.
 */
export type OrderStatus = {
  id: string;
  status: string;
  stage: OrderStage;
  trackingNumber: string | null;
  driverAssigned: boolean;
};
