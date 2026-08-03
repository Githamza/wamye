import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stageForState, isOrderState } from "@/lib/order-status";
import type { TrackedOrder } from "@/lib/order-types";

/**
 * The customer's view of their order.
 *
 * Replaces GET /api/orders/[id], which proxied Fleetbase with no ownership
 * check at all — any id was readable by anyone. The fix is structural rather
 * than a patch: a 128-bit random token IS the capability, there is no id to
 * enumerate, and what comes back is a hand-built projection, never the row.
 *
 * Service-role read on purpose: the customer is anonymous, and migration 0014
 * deliberately grants the anon role nothing on `orders`.
 */

export const dynamic = "force-dynamic";

/** Older than this and the scooter on the map is a lie. */
const FIX_FRESHNESS_MS = 5 * 60 * 1000;

export async function GET(
  _request: Request,
  props: { params: Promise<{ token: string }> },
) {
  const { token } = await props.params;
  if (!token || token.length < 16) {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      "state, tracking_number, commerce_name, fee, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, driver_lat, driver_lng, driver_pos_at, proof_path, driver_id",
    )
    .eq("tracking_token", token)
    .maybeSingle();

  if (error) {
    console.error("[track] read failed:", error.message);
    return NextResponse.json(
      { error: "tracking-unavailable" },
      { status: 502 },
    );
  }
  if (!data) {
    return NextResponse.json(
      { error: "tracking-unavailable" },
      { status: 404 },
    );
  }

  const state = isOrderState(data.state) ? data.state : "pending";
  const running = state === "accepted" || state === "picked_up";

  // First name only: enough for the customer to recognise who is coming,
  // without handing out a driver's full identity to anyone with the link.
  let driverName: string | null = null;
  if (running && data.driver_id) {
    const { data: driver } = await supabase
      .from("profiles")
      .select("name")
      .eq("id", data.driver_id)
      .maybeSingle();
    driverName =
      (driver?.name as string | null)?.trim().split(/\s+/)[0] ?? null;
  }

  const fixAt = data.driver_pos_at
    ? new Date(data.driver_pos_at as string)
    : null;
  const fixIsFresh =
    fixAt !== null && Date.now() - fixAt.getTime() < FIX_FRESHNESS_MS;

  let proofUrl: string | null = null;
  if (state === "delivered" && data.proof_path) {
    const { data: signed } = await supabase.storage
      .from("delivery-proofs")
      .createSignedUrl(data.proof_path as string, 3600);
    proofUrl = signed?.signedUrl ?? null;
  }

  const body: TrackedOrder = {
    stage: stageForState(state),
    state,
    trackingNumber: (data.tracking_number as string | null) ?? null,
    commerceName: (data.commerce_name as string | null) ?? null,
    fee: (data.fee as number | null) ?? null,
    driverName,
    driver:
      running &&
      fixIsFresh &&
      data.driver_lat != null &&
      data.driver_lng != null
        ? {
            lat: data.driver_lat as number,
            lng: data.driver_lng as number,
            at: (data.driver_pos_at as string) ?? "",
          }
        : null,
    pickup:
      data.pickup_lat != null && data.pickup_lng != null
        ? { lat: data.pickup_lat as number, lng: data.pickup_lng as number }
        : null,
    dropoff:
      data.dropoff_lat != null && data.dropoff_lng != null
        ? { lat: data.dropoff_lat as number, lng: data.dropoff_lng as number }
        : null,
    proofUrl,
  };

  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-store" },
  });
}
