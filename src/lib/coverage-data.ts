// ============================================================
// Reading national coverage — SERVER ONLY, super-admin only.
//
// Two service-role reads (every tenant, every member), joined in memory and
// resolved to a governorate each. Service-role because this is the one view
// that is deliberately NOT tenant-scoped: RLS would return the caller's own
// tenant and nothing else.
// ============================================================

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Livreur, PositionSource } from "@/lib/coverage";
import { inTunisia, matchGovernorates, nearestGovernorate } from "@/lib/tunisia";

/**
 * The zone every signup starts with (src/lib/actions/signup.ts) — Djerba, from
 * back when the app served one island.
 *
 * A tenant still sitting on it has told us nothing about where they work, so it
 * must not be read as a position: taken at face value it would stack 130
 * livreurs onto Médenine and hide the fact that most of them are in Grand Tunis.
 * A real Djerba livreur is unaffected — their area label says Djerba, and the
 * label pass places them there anyway.
 */
const SIGNUP_ZONE = { lat: 33.808, lng: 10.995 };

function isSignupZone(lat: number | null, lng: number | null): boolean {
  if (lat == null || lng == null) return true;
  return (
    Math.abs(lat - SIGNUP_ZONE.lat) < 1e-4 && Math.abs(lng - SIGNUP_ZONE.lng) < 1e-4
  );
}

type TenantRow = {
  id: string;
  slug: string;
  name: string;
  status: string;
  created_at: string;
  branding: { areaLabel?: string } | null;
  zone: { centerLat?: number; centerLng?: number } | null;
};

type MemberRow = {
  id: string;
  tenant_id: string | null;
  name: string | null;
  phone: string | null;
  parent_profile_id: string | null;
  last_lat: number | null;
  last_lng: number | null;
  last_position_at: string | null;
};

/** The best fix a team has: the freshest one, and only if it is in Tunisia. */
function teamPosition(members: MemberRow[]): { lat: number; lng: number; ageMin: number } | null {
  const now = Date.now();
  let best: { lat: number; lng: number; ageMin: number } | null = null;
  for (const m of members) {
    if (m.last_lat == null || m.last_lng == null) continue;
    if (!inTunisia({ lat: m.last_lat, lng: m.last_lng })) continue;
    const at = m.last_position_at ? Date.parse(m.last_position_at) : NaN;
    const ageMin = Number.isNaN(at) ? Number.MAX_SAFE_INTEGER : Math.max(0, Math.round((now - at) / 60_000));
    if (!best || ageMin < best.ageMin) best = { lat: m.last_lat, lng: m.last_lng, ageMin };
  }
  return best;
}

/**
 * Every livreur account, placed on the map of Tunisia.
 *
 * The fallback chain is ordered by how much it is worth trusting: a real fix,
 * then a delivery zone they moved themselves, then the work area they typed.
 * A stale fix still counts — a phone that reported from Sfax three days ago is
 * a livreur in Sfax, even though dispatch would no longer reach them.
 */
export async function loadCoverage(): Promise<Livreur[]> {
  const supabase = createAdminClient();

  const [{ data: tenantRows }, { data: memberRows }] = await Promise.all([
    supabase
      .from("tenants")
      .select("id, slug, name, status, created_at, branding, zone")
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("id, tenant_id, name, phone, parent_profile_id, last_lat, last_lng, last_position_at")
      .neq("role", "super_admin"),
  ]);

  const byTenant = new Map<string, MemberRow[]>();
  for (const m of (memberRows ?? []) as MemberRow[]) {
    if (!m.tenant_id) continue;
    const list = byTenant.get(m.tenant_id);
    if (list) list.push(m);
    else byTenant.set(m.tenant_id, [m]);
  }

  return ((tenantRows ?? []) as TenantRow[]).map((t) => {
    const members = byTenant.get(t.id) ?? [];
    const owner = members.find((m) => m.parent_profile_id === null) ?? members[0] ?? null;
    const areaLabel = t.branding?.areaLabel?.trim() || null;

    const base = {
      tenantId: t.id,
      name: t.name,
      slug: t.slug,
      status: t.status,
      areaLabel,
      phone: owner?.phone ?? null,
      createdAt: t.created_at,
      memberCount: members.length,
      alsoGovKeys: [] as string[],
      matched: null as string | null,
      fuzzy: false,
      lat: null as number | null,
      lng: null as number | null,
      positionAgeMin: null as number | null,
    };

    // Computed up front: it is the last resort for a placed livreur, and also
    // the tie-breaker that keeps a tester abroad from being written off when
    // they told us which governorate they actually deliver in.
    const matches = matchGovernorates(areaLabel);

    const fix = teamPosition(members);
    if (fix) {
      const gov = nearestGovernorate(fix);
      return {
        ...base,
        source: "gps" as PositionSource,
        govKey: gov.key,
        matched: gov.name,
        lat: fix.lat,
        lng: fix.lng,
        positionAgeMin: fix.ageMin === Number.MAX_SAFE_INTEGER ? null : fix.ageMin,
      };
    }

    const zoneLat = t.zone?.centerLat ?? null;
    const zoneLng = t.zone?.centerLng ?? null;
    if (!isSignupZone(zoneLat, zoneLng)) {
      const point = { lat: zoneLat as number, lng: zoneLng as number };
      if (inTunisia(point)) {
        const gov = nearestGovernorate(point);
        return {
          ...base,
          source: "zone" as PositionSource,
          govKey: gov.key,
          matched: gov.name,
          lat: point.lat,
          lng: point.lng,
        };
      }
      // A zone abroad is a tester, not coverage — but their area label may
      // still say where they actually deliver, so try that before giving up.
      if (matches.length === 0) {
        return {
          ...base,
          source: "abroad" as PositionSource,
          govKey: null,
          lat: point.lat,
          lng: point.lng,
        };
      }
    }

    if (matches.length > 0) {
      const [primary, ...rest] = matches;
      return {
        ...base,
        source: "label" as PositionSource,
        govKey: primary.gov.key,
        alsoGovKeys: rest.map((m) => m.gov.key),
        matched: primary.matched,
        fuzzy: primary.fuzzy,
      };
    }

    return { ...base, source: "unknown" as PositionSource, govKey: null };
  });
}
