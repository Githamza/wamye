// ============================================================
// Reading the team — SERVER ONLY.
//
// Two RLS-scoped reads, joined in memory: profiles_select_team gives every
// active member of my tenant, orders_select_tenant gives the courses they are
// on. Neither needs a new policy — a team already sees its own orders.
// ============================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { COURSE_COLUMNS, type DriverOrder } from "@/lib/order-types";
import { POSITION_FRESH_MINUTES, type CrewMember } from "@/lib/crew";

type ProfileRow = {
  id: string;
  name: string | null;
  last_lat: number | null;
  last_lng: number | null;
  last_position_at: string | null;
};

const CREW_COLUMNS = "id, name, last_lat, last_lng, last_position_at";

/**
 * Everyone on my team, me included, with their current course attached.
 *
 * Ordered the way a driver scans it: me first — I am the row I check against —
 * then whoever is out delivering, then the rest by name.
 */
export async function loadCrew(
  tenantId: string,
  meId: string,
): Promise<CrewMember[]> {
  const supabase = await createClient();

  const [{ data: profiles }, { data: orders }] = await Promise.all([
    supabase
      .from("profiles")
      .select(CREW_COLUMNS)
      .eq("tenant_id", tenantId)
      .eq("status", "active"),
    // A course in flight is one of these two states; anything terminal has
    // already left the driver's hands.
    supabase
      .from("orders")
      .select(COURSE_COLUMNS)
      .in("state", ["accepted", "picked_up"]),
  ]);

  const running = new Map<string, DriverOrder>();
  for (const o of (orders ?? []) as DriverOrder[]) {
    if (o.driver_id) running.set(o.driver_id, o);
  }

  const now = Date.now();
  const crew: CrewMember[] = ((profiles ?? []) as ProfileRow[]).map((p) => {
    const at = p.last_position_at ? Date.parse(p.last_position_at) : NaN;
    const ageMin = Number.isNaN(at)
      ? null
      : Math.max(0, Math.round((now - at) / 60_000));
    return {
      id: p.id,
      name: p.name,
      isMe: p.id === meId,
      lat: p.last_lat,
      lng: p.last_lng,
      positionAgeMin: ageMin,
      positionFresh: ageMin != null && ageMin < POSITION_FRESH_MINUTES,
      order: running.get(p.id) ?? null,
    };
  });

  return crew.sort((a, b) => {
    if (a.isMe !== b.isMe) return a.isMe ? -1 : 1;
    const busy = Number(Boolean(b.order)) - Number(Boolean(a.order));
    if (busy !== 0) return busy;
    return (a.name ?? "").localeCompare(b.name ?? "");
  });
}
