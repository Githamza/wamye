import { NextResponse } from "next/server";
import { feeForKm } from "@/lib/fees";
import { isInZone } from "@/lib/geo";
import { resolvePublicConfig } from "@/lib/tenant";
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

  // The client already checks this, but the fee is money: re-check server-side
  // rather than trust a coordinate that arrived over the wire.
  const slug =
    request.headers.get("x-tenant-slug") ??
    new URL(request.url).searchParams.get("slug");
  const { zone, feeConfig } = await resolvePublicConfig(slug);
  if (!isInZone(body.destination, zone)) {
    return NextResponse.json(
      { error: "Adresse hors zone de livraison." },
      { status: 422 },
    );
  }

  try {
    const leg = await computeDriveLeg(body.origin, body.destination);

    // No drivable route (e.g. a pin dropped in the sea off Djerba).
    if (!leg) {
      return NextResponse.json(
        { error: "Aucun itinéraire routier vers cette adresse." },
        { status: 422 },
      );
    }

    const quote: Quote = {
      distanceKm: leg.distanceKm,
      durationMin: leg.durationMin,
      fee: feeForKm(leg.distanceKm, feeConfig),
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
