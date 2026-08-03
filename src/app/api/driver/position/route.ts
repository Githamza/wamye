import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

/**
 * GPS ingest for the driver PWA.
 *
 * A Route Handler and NOT a Server Action, for three reasons:
 *   1. Next dispatches server actions one at a time per client, so a ping every
 *      15 s would sit in the same queue as the driver's "Livré" tap and delay it;
 *   2. every action response that revalidates drags a re-rendered RSC payload
 *      along — four pointless route re-renders a minute, on a phone, on 3G;
 *   3. this is telemetry, not a mutation of anything on screen.
 *
 * The write itself is record_driver_position() (migration 0015), through the
 * user's cookie-bound client so the function can read auth.uid().
 */

export const dynamic = "force-dynamic";

type Body = {
  /** The active course, or null when the driver is merely idle-and-open. */
  orderId?: string | null;
  lat?: unknown;
  lng?: unknown;
  accuracy?: unknown;
  heading?: unknown;
  speed?: unknown;
};

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export async function POST(request: Request) {
  // The proxy matcher does not cover /api, so this is the only gate.
  const user = await getSessionUser();
  if (!user) return new NextResponse(null, { status: 401 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const lat = num(body.lat);
  const lng = num(body.lng);
  if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return new NextResponse(null, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_driver_position", {
    p_order_id: typeof body.orderId === "string" ? body.orderId : null,
    p_lat: lat,
    p_lng: lng,
    p_accuracy: num(body.accuracy),
    p_heading: num(body.heading),
    p_speed: num(body.speed),
  });

  if (error) {
    // A stale orderId or a suspended member lands here. Nothing the phone can
    // do about it, and the loop must not spam the user with toasts.
    console.error("[driver/position] rejected:", error.message);
    return new NextResponse(null, { status: 409 });
  }

  return new NextResponse(null, { status: 204 });
}
