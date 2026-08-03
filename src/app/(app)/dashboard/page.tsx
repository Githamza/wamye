import { setRequestLocale } from "next-intl/server";
import { requireTenant } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { ShopLink } from "@/components/shop-link";
import { DriverBoard } from "@/components/driver/driver-board";
import { PushSetup } from "@/components/pwa/push-setup";
import type { DriverOrder } from "@/lib/order-types";

/**
 * The driver's home.
 *
 * This used to be a frozen list of the last 50 orders plus a Navigator
 * onboarding block. Navigator is gone and the list moved to /dashboard/history:
 * what a driver opens the app for is the course they are on and the ones they
 * can take, so that is what the home page is now.
 *
 * Seeded here on the server so the first paint is real; DriverBoard keeps it
 * live from there.
 */

export const dynamic = "force-dynamic";

const COURSE_COLUMNS =
  "id, state, created_at, commerce_name, commerce_addr, order_text, repere, phone, customer_name, fee, distance_km, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, driver_id";

/** Older than this and nobody is coming — it clutters the feed instead. */
const FEED_WINDOW = "2 hours";

export default async function DashboardPage() {
  const profile = await requireTenant();
  setRequestLocale(profile.locale);

  const supabase = await createClient();

  // RLS (orders_select_tenant) scopes all three reads to the tenant.
  const [{ data: tenant }, { data: mine }, { data: pending }] =
    await Promise.all([
      supabase
        .from("tenants")
        .select("slug, dispatch_radius_km")
        .eq("id", profile.tenantId)
        .maybeSingle(),
      supabase
        .from("orders")
        .select(COURSE_COLUMNS)
        .eq("driver_id", profile.id)
        .in("state", ["accepted", "picked_up"])
        .order("accepted_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      // An RPC rather than a table read: the feed must exclude the courses this
      // driver has declined, and PostgREST cannot express NOT EXISTS. The
      // window and the ordering live in feed_courses() — see migration 0018.
      supabase.rpc("feed_courses", { p_window: FEED_WINDOW }),
    ]);

  return (
    <div className="flex flex-col gap-4">
      {tenant?.slug && <ShopLink slug={tenant.slug} />}

      {/* Here rather than in Réglages, which is owner-only: notifications are a
          per-device setting every member — sub-drivers included — must reach. */}
      <PushSetup />

      <DriverBoard
        tenantId={profile.tenantId}
        profileId={profile.id}
        dispatchRadiusKm={Number(tenant?.dispatch_radius_km ?? 8)}
        initialActive={(mine as DriverOrder | null) ?? null}
        initialPending={(pending ?? []) as DriverOrder[]}
      />
    </div>
  );
}
