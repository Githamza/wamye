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

import "server-only";
import type {
  CreateOrderInput,
  CreatedOrder,
  OrderStage,
  OrderStatus,
} from "@/lib/order-types";

/**
 * Per-tenant Fleetbase credentials + dispatch config. One tenant maps to one
 * Fleetbase company, so scoping an order to a company is a matter of using
 * that company's API key — orders then only reach that company's drivers.
 */
export type FleetbaseContext = {
  apiUrl: string;
  apiKey: string;
  orderType?: string;
  dispatch: boolean;
  adhoc: boolean;
  /** Broadcast radius in meters; undefined → Fleetbase's own default. */
  adhocDistance?: number;
};

/**
 * Build a context from the legacy single-tenant env vars. Used as a fallback
 * until a tenant's config is stored in the database (see tenant.ts), which
 * keeps the app working exactly as before during the migration.
 */
export function envFleetbaseContext(): FleetbaseContext | null {
  const apiKey = (process.env.FLEETBASE_API_KEY ?? "").trim();
  if (!apiKey) return null;
  const adhocDistanceRaw = process.env.FLEETBASE_ADHOC_DISTANCE ?? "";
  return {
    apiUrl: (process.env.FLEETBASE_API_URL ?? "http://91.134.240.158").replace(/\/+$/, ""),
    apiKey,
    orderType: process.env.FLEETBASE_ORDER_TYPE || undefined,
    dispatch: (process.env.FLEETBASE_DISPATCH ?? "true").toLowerCase() !== "false",
    adhoc: (process.env.FLEETBASE_ADHOC ?? "true").toLowerCase() !== "false",
    adhocDistance: adhocDistanceRaw ? Number(adhocDistanceRaw) : undefined,
  };
}

export class FleetbaseError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "FleetbaseError";
  }
}

type FleetbaseOrder = {
  id?: string;
  public_id?: string;
  tracking_number?: string | { tracking_number?: string } | null;
  status?: string | null;
  driver_assigned?: unknown;
  errors?: string[];
};

async function request(
  ctx: FleetbaseContext,
  path: string,
  init?: RequestInit,
): Promise<FleetbaseOrder> {
  if (!ctx.apiKey.trim()) {
    throw new FleetbaseError("Fleetbase API key is not configured", 503);
  }

  const apiUrl = ctx.apiUrl.replace(/\/+$/, "");
  let res: Response;
  try {
    res = await fetch(`${apiUrl}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${ctx.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch (cause) {
    throw new FleetbaseError(
      `Cannot reach Fleetbase at ${apiUrl}: ${(cause as Error).message}`,
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
function buildPayload(
  input: CreateOrderInput,
  ctx: FleetbaseContext,
): Record<string, unknown> {
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
    dispatch: ctx.dispatch,
    adhoc: ctx.adhoc,
  };
  if (ctx.orderType) payload.type = ctx.orderType;
  if (ctx.adhoc && ctx.adhocDistance) payload.adhoc_distance = ctx.adhocDistance;

  return payload;
}

/**
 * A Fleetbase client bound to one tenant's company credentials. Build it per
 * request from the resolved FleetbaseContext (see tenant.ts).
 */
export function createFleetbaseClient(ctx: FleetbaseContext) {
  return {
    /** Create a delivery order in this tenant's Fleetbase company. */
    async createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
      const order = await request(ctx, "/v1/orders", {
        method: "POST",
        body: JSON.stringify(buildPayload(input, ctx)),
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
    },

    /** Read a single order's current status for the tracking timeline. */
    async getOrder(id: string): Promise<OrderStatus> {
      const order = await request(ctx, `/v1/orders/${encodeURIComponent(id)}`);
      return {
        id: order.public_id ?? order.id ?? id,
        status: order.status ?? "created",
        stage: statusToStage(order.status),
        trackingNumber: readTrackingNumber(order),
        driverAssigned: readDriverAssigned(order),
      };
    },

    /** Cheap authenticated GET to validate the credentials ("Test connection"). */
    async ping(): Promise<void> {
      await request(ctx, "/v1/orders?limit=1");
    },
  };
}
