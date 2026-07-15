import { NextResponse } from "next/server";
import { createFleetbaseClient, FleetbaseError } from "@/lib/fleetbase";
import {
  getTenantIdBySlug,
  recordOrderMirror,
  resolveFleetbaseContext,
} from "@/lib/tenant";
import type { CreateOrderInput } from "@/lib/order-types";

// Order creation must always hit Fleetbase at request time.
export const dynamic = "force-dynamic";

function isValidBody(b: unknown): b is CreateOrderInput {
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

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  if (!isValidBody(body)) {
    return NextResponse.json(
      { error: "Commande incomplète (commande, commerce ou numéro manquant)." },
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
      { error: "Le service de commande n'est pas configuré." },
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
      { error: "Échec de l'envoi de la commande. Réessayez." },
      { status: status >= 500 ? 502 : status },
    );
  }
}
