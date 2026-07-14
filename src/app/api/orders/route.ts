import { NextResponse } from "next/server";
import { createOrder, FleetbaseError, isConfigured } from "@/lib/fleetbase";
import { isValidPhone } from "@/lib/phone";
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
    typeof o.country === "string" &&
    typeof o.phone === "string" &&
    // Country-aware: the number must be valid for the customer's country.
    isValidPhone(o.phone, o.country)
  );
}

export async function POST(request: Request) {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "Le service de commande n'est pas configuré." },
      { status: 503 },
    );
  }

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

  try {
    const created = await createOrder(body);
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
