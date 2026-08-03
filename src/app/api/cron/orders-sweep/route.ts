import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  notifyOwnersOfStaleOrders,
  type StaleOrder,
} from "@/lib/stale-order-email";

/**
 * The sweep that stops orders dying in silence.
 *
 * Two passes, in this order:
 *   1. warn the owner about anything unclaimed for 30 minutes — while there is
 *      still time to phone a driver or the customer;
 *   2. cancel anything still unclaimed at the feed window, so the customer's
 *      tracking page shows a course that is over rather than one eternally
 *      "looking for a driver".
 *
 * ALERT_AFTER must stay well under EXPIRE_AFTER, and EXPIRE_AFTER must equal
 * the feed window in feed_courses() — a course has to be visible for exactly as
 * long as it can still be taken. Any gap between those two recreates the black
 * hole this exists to close.
 *
 * Called by a scheduled task; guarded by a shared secret because it is a public
 * route that writes.
 */

export const dynamic = "force-dynamic";

const ALERT_AFTER = "30 minutes";
const EXPIRE_AFTER = "3 hours";

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // No secret configured means no sweep, rather than an open write endpoint.
  if (!secret) return false;
  const header =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    request.headers.get("x-cron-secret");
  return header === secret;
}

async function sweep() {
  const supabase = createAdminClient();

  // Warn first: an order that is about to expire should have been flagged an
  // hour earlier, and claim_unclaimed_alerts() stamps as it selects so two
  // concurrent runs cannot both email about the same course.
  const { data: unclaimed, error: unclaimedError } = await supabase.rpc(
    "claim_unclaimed_alerts",
    { p_after: ALERT_AFTER },
  );
  if (unclaimedError) throw new Error(`alerts: ${unclaimedError.message}`);

  const { data: expired, error: expiredError } = await supabase.rpc(
    "expire_stale_orders",
    { p_after: EXPIRE_AFTER },
  );
  if (expiredError) throw new Error(`expiry: ${expiredError.message}`);

  const warned = await notifyOwnersOfStaleOrders(
    (unclaimed ?? []) as StaleOrder[],
    "unclaimed",
  );
  const closed = await notifyOwnersOfStaleOrders(
    (expired ?? []) as StaleOrder[],
    "expired",
  );

  return {
    unclaimed: (unclaimed ?? []).length,
    expired: (expired ?? []).length,
    ownersWarned: warned,
    ownersToldOfExpiry: closed,
  };
}

export async function POST(request: Request) {
  if (!authorised(request)) return new NextResponse(null, { status: 401 });
  try {
    const result = await sweep();
    console.log("[orders-sweep]", JSON.stringify(result));
    return NextResponse.json(result);
  } catch (err) {
    console.error("[orders-sweep] failed:", (err as Error).message);
    return NextResponse.json({ error: "sweep-failed" }, { status: 500 });
  }
}

// Same handler on GET: most cron runners send a plain GET, and this stays
// unreachable without the secret either way.
export const GET = POST;
