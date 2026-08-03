import { NextResponse, after } from "next/server";
import { notifyTenantDrivers } from "@/lib/push/send";
import { createFleetbaseClient, FleetbaseError } from "@/lib/fleetbase";
import { sendNewOrderAlertEmails } from "@/lib/order-alert-email";
import { getTenantForOrder, resolveFleetbaseContext } from "@/lib/tenant";
import { createOrderRecord } from "@/lib/orders";
import { allow, clientIp } from "@/lib/rate-limit";
import { priceCourse } from "@/lib/pricing";
import { isInZone } from "@/lib/geo";
import { siteOrigin } from "@/lib/site-url";
import type { CreateOrderInput } from "@/lib/order-types";

/**
 * Reject cross-origin POSTs. The order form is served from this app, so a
 * request without a matching Origin/Referer is not a customer.
 *
 * Lenient when the browser sends neither header (some in-app webviews strip
 * them): the other guards — validated tenant, rate limit, server-side pricing —
 * still apply, and refusing a real customer is the costlier mistake.
 */
async function isSameOrigin(request: Request): Promise<boolean> {
  const origin =
    request.headers.get("origin") ?? request.headers.get("referer");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(await siteOrigin()).origin;
  } catch {
    return false;
  }
}

// Order creation must always hit Fleetbase at request time.
export const dynamic = "force-dynamic";

function isValidBody(
  b: unknown,
): b is Omit<CreateOrderInput, "commercePosition"> {
  if (!b || typeof b !== "object") return false;
  const o = b as Record<string, unknown>;
  return (
    typeof o.order === "string" &&
    o.order.trim() !== "" &&
    typeof o.commerceName === "string" &&
    o.commerceName.trim() !== "" &&
    typeof o.phone === "string" &&
    /^[2459]\d{7}$/.test(o.phone)
  );
}

/**
 * A pickup is only usable with real coordinates — see the note on
 * CreateOrderInput.commercePosition for what happens without them. Checked
 * separately from isValidBody so the customer gets a cause they can act on
 * ("choose the shop from the list") rather than a generic "incomplete order".
 */
function hasPickupCoordinates(b: unknown): b is CreateOrderInput {
  const p = (b as Record<string, unknown>).commercePosition;
  if (!p || typeof p !== "object") return false;
  const { lat, lng } = p as Record<string, unknown>;
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    // Fleetbase treats the null island as "no location" and excludes such
    // rows from adhoc matching outright.
    !(lat === 0 && lng === 0)
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }

  if (!isValidBody(body)) {
    return NextResponse.json({ error: "incomplete-order" }, { status: 400 });
  }

  if (!hasPickupCoordinates(body)) {
    return NextResponse.json(
      { error: "commerce-not-located" },
      { status: 400 },
    );
  }

  // Cheap cross-origin brake before anything touches the database. Mirrors what
  // Server Actions do natively; the x-tenant-slug header path that used to sit
  // here is gone — nothing ever set it, so it was pure attacker surface.
  if (!(await isSameOrigin(request))) {
    return NextResponse.json({ error: "bad-request" }, { status: 403 });
  }

  const slug =
    typeof (body as { slug?: unknown }).slug === "string"
      ? ((body as { slug?: string }).slug as string)
      : null;
  if (!slug) {
    return NextResponse.json({ error: "orders-unavailable" }, { status: 503 });
  }

  // Resolved AND validated: is_active and status='active'. An order could
  // previously be filed against a tenant still awaiting approval.
  const tenant = await getTenantForOrder(slug);
  if (!tenant) {
    return NextResponse.json({ error: "orders-unavailable" }, { status: 503 });
  }

  const ctx = await resolveFleetbaseContext(slug);
  if (!ctx) {
    return NextResponse.json({ error: "orders-unavailable" }, { status: 503 });
  }

  // Per phone first (the sharper signal), then per IP.
  const withinLimits =
    (await allow(`order:phone:${body.phone}`, 5, "10 minutes")) &&
    (await allow(`order:ip:${clientIp(request)}`, 20, "1 hour"));
  if (!withinLimits) {
    return NextResponse.json({ error: "too-many-orders" }, { status: 429 });
  }

  // The delivery zone is the tenant's promise about where it can serve. The
  // browser checks it too, for a fast answer; this is the one that counts.
  if (body.position && !isInZone(body.position, tenant.zone)) {
    return NextResponse.json({ error: "out-of-zone" }, { status: 400 });
  }

  // Recomputed server-side, and the body's fee/distanceKm are ignored. This row
  // is now the order, and its fee is what the driver gets paid.
  const priced = await priceCourse(
    body.commercePosition,
    body.position,
    tenant.feeConfig,
  );
  const order: CreateOrderInput = {
    ...body,
    fee: priced.fee,
    distanceKm: priced.distanceKm,
    quoteSource: priced.source,
  };

  try {
    const created = await createFleetbaseClient(ctx).createOrder(order);

    // Supabase now holds the order itself, not a mirror of it: a failed insert
    // must fail the request rather than leave a course no driver will ever see.
    const record = await createOrderRecord(tenant.id, order, {
      id: created.id,
      trackingNumber: created.trackingNumber,
      status: created.status,
      stage: created.stage,
    });

    // after(): the customer's 201 must not wait on a push fan-out. The email
    // moves here too at the Fleetbase cutover, when its recipient list stops
    // coming from Fleetbase.
    after(() =>
      notifyTenantDrivers(tenant.id, {
        orderId: record.id,
        commerceName: order.commerceName,
        fee: order.fee,
        pickup: order.commercePosition,
      }),
    );

    // Best-effort driver alert: this instance has no working push channel for
    // Navigator, so drivers are told by email that a course is up for grabs.
    await sendNewOrderAlertEmails(ctx, order);

    return NextResponse.json(
      { ...created, trackingToken: record.trackingToken },
      { status: 201 },
    );
  } catch (err) {
    const status = err instanceof FleetbaseError ? err.status : 500;
    const message =
      err instanceof FleetbaseError
        ? err.message
        : "Échec de l'envoi de la commande.";
    // Log server-side for debugging; don't leak internals to the client.
    console.error("[orders] create failed:", message);
    return NextResponse.json(
      { error: "create-failed" },
      { status: status >= 500 ? 502 : status },
    );
  }
}
