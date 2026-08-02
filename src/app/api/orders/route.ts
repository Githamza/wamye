import { NextResponse } from "next/server";
import { createFleetbaseClient, FleetbaseError } from "@/lib/fleetbase";
import { sendNewOrderAlertEmails } from "@/lib/order-alert-email";
import {
  getTenantIdBySlug,
  recordOrderMirror,
  resolveFleetbaseContext,
} from "@/lib/tenant";
import type { CreateOrderInput } from "@/lib/order-types";

// Order creation must always hit Fleetbase at request time.
export const dynamic = "force-dynamic";

function isValidBody(b: unknown): b is Omit<CreateOrderInput, "commercePosition"> {
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
    return NextResponse.json(
      { error: "incomplete-order" },
      { status: 400 },
    );
  }

  if (!hasPickupCoordinates(body)) {
    return NextResponse.json(
      { error: "commerce-not-located" },
      { status: 400 },
    );
  }

  // Which tenant this order belongs to: the Proxy-set header, or a slug on the
  // body. Falls back to the legacy env key when no tenant is configured yet.
  const slug =
    request.headers.get("x-tenant-slug") ??
    (typeof (body as { slug?: unknown }).slug === "string"
      ? ((body as { slug?: string }).slug as string)
      : null);

  const ctx = await resolveFleetbaseContext(slug);
  if (!ctx) {
    return NextResponse.json(
      { error: "orders-unavailable" },
      { status: 503 },
    );
  }

  try {
    const created = await createFleetbaseClient(ctx).createOrder(body);

    // Best-effort dashboard mirror (only when the slug resolves to a tenant).
    if (slug) {
      const tenantId = await getTenantIdBySlug(slug);
      if (tenantId) await recordOrderMirror(tenantId, body, created);
    }

    // Best-effort driver alert: this instance has no working push channel for
    // Navigator, so drivers are told by email that a course is up for grabs.
    await sendNewOrderAlertEmails(ctx, body);

    return NextResponse.json(created, { status: 201 });
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
