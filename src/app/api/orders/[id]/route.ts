import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createFleetbaseClient, FleetbaseError } from "@/lib/fleetbase";
import { resolveFleetbaseContext } from "@/lib/tenant";

// Status polling is always request-time (never cached).
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/orders/[id]">,
) {
  const slug =
    request.headers.get("x-tenant-slug") ??
    request.nextUrl.searchParams.get("slug");

  const fbCtx = await resolveFleetbaseContext(slug);
  if (!fbCtx) {
    return NextResponse.json(
      { error: "orders-unavailable" },
      { status: 503 },
    );
  }

  const { id } = await ctx.params;

  try {
    const status = await createFleetbaseClient(fbCtx).getOrder(id);
    return NextResponse.json(status, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const status = err instanceof FleetbaseError ? err.status : 500;
    console.error(`[orders/${id}] status failed:`, (err as Error).message);
    return NextResponse.json(
      { error: "tracking-unavailable" },
      { status: status === 404 ? 404 : 502 },
    );
  }
}
