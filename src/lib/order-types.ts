// ============================================================
// Order DTOs — shared between the browser and the API routes.
// No secrets here: safe to import from client components.
// ============================================================

/** Coarse delivery stage that drives the confirm-screen timeline. */
export type OrderStage = "searching" | "enroute" | "delivered" | "canceled";

/** What the browser sends to POST /api/orders. */
export type CreateOrderInput = {
  order: string;
  commerceName: string;
  commerceAddr?: string | null;
  repere?: string;
  /** 8 local digits, e.g. "22483921". */
  phone: string;
  prenom?: string;
  fee: number | null;
  distanceKm: number | null;
  position: { lat: number; lng: number } | null;
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
