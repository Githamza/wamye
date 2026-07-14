import { NextResponse } from "next/server";
import { feeForKm, MAX_DELIVERY_KM } from "@/lib/djerba";
import { computeDriveLeg, isConfigured, RoutesError } from "@/lib/routes";
import type { QuoteInput, Quote } from "@/lib/order-types";

// A quote depends on live road conditions; never prerender or cache it.
export const dynamic = "force-dynamic";

function isLatLng(v: unknown): v is { lat: number; lng: number } {
  if (!v || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.lat === "number" &&
    typeof p.lng === "number" &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180
  );
}

function isValidBody(b: unknown): b is QuoteInput {
  if (!b || typeof b !== "object") return false;
  const o = b as Record<string, unknown>;
  return isLatLng(o.origin) && isLatLng(o.destination);
}

export async function POST(request: Request) {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "Le calcul d'itinéraire n'est pas configuré." },
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
      { error: "Coordonnées manquantes ou invalides." },
      { status: 400 },
    );
  }

  try {
    const leg = await computeDriveLeg(body.origin, body.destination);

    // No drivable route (e.g. a pin dropped in the middle of a lake/river).
    if (!leg) {
      return NextResponse.json(
        { error: "Aucun itinéraire routier vers cette adresse." },
        { status: 422 },
      );
    }

    // The fee is money: re-check server-side that the commerce is close enough
    // to deliver from, rather than trust a coordinate that arrived over the wire.
    if (leg.distanceKm > MAX_DELIVERY_KM) {
      return NextResponse.json(
        { error: "Commerce trop loin de l'adresse de livraison." },
        { status: 422 },
      );
    }

    const quote: Quote = {
      distanceKm: leg.distanceKm,
      durationMin: leg.durationMin,
      fee: feeForKm(leg.distanceKm),
      source: "road",
    };
    return NextResponse.json(quote);
  } catch (err) {
    const status = err instanceof RoutesError ? err.status : 500;
    const message = err instanceof RoutesError ? err.message : "Échec du calcul.";
    // Log server-side for debugging; don't leak internals to the client.
    console.error("[quote] route computation failed:", message);
    return NextResponse.json(
      { error: "Impossible de calculer l'itinéraire." },
      { status: status >= 500 ? 502 : status },
    );
  }
}
