// ============================================================
// Order persistence — Supabase is the source of truth.
//
// Replaces recordOrderMirror() from @/lib/tenant, which wrote a partial row and
// swallowed its own errors because Fleetbase held the real record. It no longer
// does: this row IS the order. Two consequences, both deliberate:
//
//   * every field the browser sent is stored, including the pickup coordinates
//     and the landmark, which the mirror dropped on the floor;
//   * a failed insert throws. An order the driver will never see is worse than
//     an error the customer can retry.
// ============================================================

import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { CreateOrderInput, LatLng } from "@/lib/order-types";

/** What the caller needs back to address the order afterwards. */
export type OrderRecord = {
  /** The orders row uuid — the order's identity from now on. */
  id: string;
  /** Unguessable capability for the customer's tracking page. */
  trackingToken: string;
};

function coord(p: LatLng | null | undefined): {
  lat: number | null;
  lng: number | null;
} {
  return p ? { lat: p.lat, lng: p.lng } : { lat: null, lng: null };
}

/** Upsert the customer, then write the order. Throws on failure. */
export async function createOrderRecord(
  tenantId: string,
  input: CreateOrderInput,
): Promise<OrderRecord> {
  const supabase = createAdminClient();

  // Only set name/landmark when provided, so a later order without a prénom
  // doesn't wipe a returning customer's saved name (omitted columns are
  // preserved by ON CONFLICT DO UPDATE).
  const clientRow: Record<string, unknown> = {
    tenant_id: tenantId,
    phone: input.phone,
  };
  if (input.prenom?.trim()) clientRow.name = input.prenom.trim();
  if (input.repere?.trim()) clientRow.last_repere = input.repere.trim();

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .upsert(clientRow, { onConflict: "tenant_id,phone" })
    .select("id")
    .maybeSingle();

  // A missing client row is survivable — the order carries the phone anyway —
  // so this one stays best-effort rather than failing the customer's order.
  if (clientError) {
    console.error("[orders] client upsert failed:", clientError.message);
  }

  const pickup = coord(input.commercePosition);
  const dropoff = coord(input.position);

  const { data, error } = await supabase
    .from("orders")
    .insert({
      tenant_id: tenantId,
      client_id: (client?.id as string) ?? null,
      state: "pending",

      phone: input.phone,
      customer_name: input.prenom?.trim() || null,
      repere: input.repere?.trim() || null,

      commerce_name: input.commerceName,
      commerce_addr: input.commerceAddr?.trim() || null,
      commerce_place_id: input.commercePlaceId?.trim() || null,
      pickup_lat: pickup.lat,
      pickup_lng: pickup.lng,
      dropoff_lat: dropoff.lat,
      dropoff_lng: dropoff.lng,

      order_text: input.order,
      fee: input.fee,
      distance_km: input.distanceKm,
      quote_source: input.quoteSource ?? "estimate",

      // `position` duplicates dropoff_lat/lng and is kept only because the
      // historical rows carry it; fleetbase_id/status/stage stay null from here
      // on, and remain solely to keep the pre-cutover archive readable.
      position: input.position,
    })
    .select("id, tracking_token")
    .single();

  if (error || !data) {
    throw new Error(
      `order insert failed: ${error?.message ?? "no row returned"}`,
    );
  }

  return {
    id: data.id as string,
    trackingToken: data.tracking_token as string,
  };
}
