// ============================================================
// Fleetbase FleetOps client — SERVER ONLY.
//
// Holds the secret API key and talks to the FleetOps REST API
// (https://<host>/v1). Never import this from a client component;
// it is only used by the route handlers under src/app/api/orders.
//
// Verified against fleetbase/fleetops-api (v0.7.51):
//   POST /v1/orders          — create (pickup/dropoff/entities/meta)
//   GET  /v1/orders/{id}      — read status + tracking number
// A delivery order maps a Djerba order like so:
//   pickup  = commerce (name + address string)
//   dropoff = customer (name + landmark + phone + GPS Point)
//   entities = the free-text order, notes/meta carry the rest.
// ============================================================

import type {
  CreateOrderInput,
  CreatedOrder,
  OrderStage,
  OrderStatus,
} from "@/lib/order-types";

const API_URL = (process.env.FLEETBASE_API_URL ?? "http://91.134.240.158").replace(
  /\/+$/,
  "",
);
const API_KEY = process.env.FLEETBASE_API_KEY ?? "";
// Fleetbase order-config key. Left empty → backend defaults to "default".
const ORDER_TYPE = process.env.FLEETBASE_ORDER_TYPE ?? "";
// Whether to immediately dispatch (start the driver search) on creation.
const DISPATCH = (process.env.FLEETBASE_DISPATCH ?? "true").toLowerCase() !== "false";
// Ad-hoc orders are broadcast to every nearby available driver instead of
// waiting for a manual assignment. Without this, `dispatch` only flips the
// order to "dispatched" and it sits there with no driver forever.
const ADHOC = (process.env.FLEETBASE_ADHOC ?? "true").toLowerCase() !== "false";
// Broadcast radius in meters. Empty → Fleetbase's own default.
const ADHOC_DISTANCE = process.env.FLEETBASE_ADHOC_DISTANCE ?? "";

export class FleetbaseError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "FleetbaseError";
  }
}

/** True when a key is configured — routes can 503 cleanly otherwise. */
export function isConfigured(): boolean {
  return API_KEY.trim() !== "";
}

type FleetbaseOrder = {
  id?: string;
  public_id?: string;
  tracking_number?: string | { tracking_number?: string } | null;
  status?: string | null;
  driver_assigned?: unknown;
  errors?: string[];
};

async function request(path: string, init?: RequestInit): Promise<FleetbaseOrder> {
  if (!isConfigured()) {
    throw new FleetbaseError("Fleetbase API key is not configured", 503);
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch (cause) {
    throw new FleetbaseError(
      `Cannot reach Fleetbase at ${API_URL}: ${(cause as Error).message}`,
      502,
    );
  }

  const body = (await res.json().catch(() => ({}))) as FleetbaseOrder;

  if (!res.ok) {
    const msg = body.errors?.join(", ") || `Fleetbase request failed (${res.status})`;
    throw new FleetbaseError(msg, res.status);
  }

  return body;
}

/**
 * Map Fleetbase's (config-dependent) status string onto the three
 * timeline stages the UI understands. Matches by substring so it stays
 * robust across custom order-config flows.
 */
export function statusToStage(status: string | null | undefined): OrderStage {
  const s = (status ?? "").toLowerCase();
  if (!s) return "searching";
  if (/(cancel|annul|expired|failed)/.test(s)) return "canceled";
  if (/(complete|delivered|livr|dropoff|finished|fulfilled)/.test(s)) return "delivered";
  if (/(enroute|en_route|transit|start|pickup|picked|driver_enroute|route)/.test(s)) {
    return "enroute";
  }
  return "searching";
}

function readTrackingNumber(o: FleetbaseOrder): string | null {
  const t = o.tracking_number;
  if (!t) return null;
  if (typeof t === "string") return t;
  return t.tracking_number ?? null;
}

function readDriverAssigned(o: FleetbaseOrder): boolean {
  const d = o.driver_assigned;
  return d != null && d !== "" && d !== false;
}

/** Build the FleetOps order payload from a Djerba order. */
function buildPayload(input: CreateOrderInput): Record<string, unknown> {
  const phoneIntl = `+216${input.phone}`;

  const pickup: Record<string, unknown> = {
    name: input.commerceName,
    street1: input.commerceAddr?.trim() || input.commerceName,
    country: "TN",
  };
  // Exact pickup coordinates, when the commerce was picked from Google Places.
  // Without this the driver only gets a street string to interpret.
  if (input.commercePosition) {
    pickup.location = {
      type: "Point",
      coordinates: [input.commercePosition.lng, input.commercePosition.lat],
    };
  }

  const dropoff: Record<string, unknown> = {
    name: input.prenom?.trim() || "Client",
    street1: input.repere?.trim() || "Position GPS partagée par le client",
    phone: phoneIntl,
    country: "TN",
  };
  // Attach the exact drop coordinates as a GeoJSON Point (Fleetbase's
  // Point cast accepts GeoJSON directly — no geocoder required).
  if (input.position) {
    dropoff.location = {
      type: "Point",
      coordinates: [input.position.lng, input.position.lat],
    };
  }

  const payload: Record<string, unknown> = {
    pickup,
    dropoff,
    entities: [
      {
        name: input.order.slice(0, 60),
        description: input.order,
      },
    ],
    notes: [input.order, input.repere && `Repère : ${input.repere}`]
      .filter(Boolean)
      .join("\n"),
    meta: {
      source: "livraison-djerba-web",
      commerce: input.commerceName,
      phone: phoneIntl,
      prenom: input.prenom ?? "",
      delivery_fee_dt: input.fee,
      distance_km: input.distanceKm,
      // "road" = real driving distance; "estimate" = straight-line fallback.
      distance_source: input.quoteSource ?? "estimate",
    },
    dispatch: DISPATCH,
    adhoc: ADHOC,
  };
  if (ORDER_TYPE) payload.type = ORDER_TYPE;
  if (ADHOC && ADHOC_DISTANCE) payload.adhoc_distance = Number(ADHOC_DISTANCE);

  return payload;
}

/** Create a delivery order in Fleetbase. */
export async function createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
  const order = await request("/v1/orders", {
    method: "POST",
    body: JSON.stringify(buildPayload(input)),
  });

  const id = order.public_id ?? order.id;
  if (!id) {
    throw new FleetbaseError("Fleetbase did not return an order id", 502);
  }

  return {
    id,
    trackingNumber: readTrackingNumber(order),
    status: order.status ?? "created",
    stage: statusToStage(order.status),
  };
}

/** Read a single order's current status for the tracking timeline. */
export async function getOrder(id: string): Promise<OrderStatus> {
  const order = await request(`/v1/orders/${encodeURIComponent(id)}`);
  return {
    id: order.public_id ?? order.id ?? id,
    status: order.status ?? "created",
    stage: statusToStage(order.status),
    trackingNumber: readTrackingNumber(order),
    driverAssigned: readDriverAssigned(order),
  };
}
