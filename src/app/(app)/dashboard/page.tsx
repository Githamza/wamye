import Link from "next/link";
import { headers } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireTenant } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { ShopLink } from "@/components/shop-link";
import { DriverBoard } from "@/components/driver/driver-board";
import { PushSetup } from "@/components/pwa/push-setup";
import { CrewStack } from "@/components/team/crew-stack";
import { loadCrew } from "@/lib/crew-data";
import { COURSE_COLUMNS, type DriverOrder } from "@/lib/order-types";
import { isNativeShellUA } from "@/lib/native/shell";

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

/** Older than this and nobody is coming — it clutters the feed instead. */
const FEED_WINDOW = "3 hours";

export default async function DashboardPage() {
  const profile = await requireTenant();
  setRequestLocale(profile.locale);
  const t = await getTranslations("Dashboard");

  const supabase = await createClient();

  // The Android shell announces itself in the UA; deciding here (server) means
  // the board picks its position source with no hydration flash.
  const nativeShell = isNativeShellUA((await headers()).get("user-agent"));

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

  // Who else is out, and on what. Loaded here rather than in the board: it is
  // the same page load, and the board's Realtime refreshes bring it up to date
  // along with the courses.
  const crew = await loadCrew(profile.tenantId, profile.id);

  return (
    <div className="flex flex-col gap-4">
      {/* Top corner, above everything: a driver glances at who else is out
          before reading the courses, and never the other way round. */}
      <CrewStack
        crew={crew}
        tenantId={profile.tenantId}
        profileId={profile.id}
      />

      {tenant?.slug && <ShopLink slug={tenant.slug} />}

      {/* Here rather than in Réglages, which is owner-only: notifications are a
          per-device setting every member — sub-drivers included — must reach. */}
      <PushSetup />

      {/* Same per-device logic as PushSetup. Hidden inside the shell itself,
          where it would be an invitation to install what is already running. */}
      {!nativeShell && (
        <Link
          href="/telecharger"
          className="flex items-center justify-between gap-3 rounded-[14px] border border-hair bg-white p-3.5 text-[13px] text-stone-muted"
        >
          <span>{t("getApp")}</span>
          <span className="shrink-0 rounded-[8px] bg-brand px-3 py-1.5 text-[13px] font-semibold text-white">
            {t("getAppCta")}
          </span>
        </Link>
      )}

      <DriverBoard
        tenantId={profile.tenantId}
        profileId={profile.id}
        dispatchRadiusKm={Number(tenant?.dispatch_radius_km ?? 8)}
        nativeShell={nativeShell}
        initialActive={(mine as DriverOrder | null) ?? null}
        initialPending={(pending ?? []) as DriverOrder[]}
      />
    </div>
  );
}
