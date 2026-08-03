import "server-only";

import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Web Push fan-out for new courses.
 *
 * Same contract as @/lib/order-alert-email: never throws. A notification that
 * fails to send must not take the customer's order down with it — and the
 * email, which we keep, is the fallback channel anyway.
 *
 * iOS note worth remembering: push only exists on iPhone from iOS 16.4 AND
 * only when the PWA is installed to the home screen. A driver reading in
 * Safari gets nothing, which is exactly why the email stays.
 */

type Target = {
  profile_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type CoursePush = {
  orderId: string;
  commerceName: string;
  fee: number | null;
  pickup: { lat: number; lng: number } | null;
};

let configured = false;

function configure(): boolean {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:admin.wamye@mylabs.live",
    publicKey,
    privateKey,
  );
  configured = true;
  return true;
}

/** Notify every eligible driver of the tenant that a course is up for grabs. */
export async function notifyTenantDrivers(
  tenantId: string,
  course: CoursePush,
): Promise<void> {
  try {
    if (!configure()) {
      console.warn("[push] VAPID keys missing — skipping");
      return;
    }

    const supabase = createAdminClient();

    // One call, no fallback. eligible_push_targets (0019) excludes only the
    // drivers it KNOWS are far: an absent or stale position now means "notify",
    // because profiles.last_* only refreshes while the PWA is in the foreground
    // and a phone in a pocket goes stale within half an hour.
    //
    // The previous all-or-nothing fallback made this worse, not better: one
    // driver at home 20 km away with the app open made the result non-empty, so
    // the fallback never fired and the drivers actually near the pickup — phones
    // asleep — were told nothing.
    const { data } = await supabase.rpc("eligible_push_targets", {
      p_tenant_id: tenantId,
      p_lat: course.pickup?.lat ?? null,
      p_lng: course.pickup?.lng ?? null,
    });

    const targets = (data ?? []) as Target[];
    if (targets.length === 0) return;

    const payload = JSON.stringify({
      title: "🛵 Nouvelle course",
      body: course.fee
        ? `${course.commerceName} — ${course.fee} DT`
        : course.commerceName,
      url: "/dashboard",
      tag: "wamye-course",
    });

    const results = await Promise.allSettled(
      targets.map((t) =>
        webpush.sendNotification(
          { endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } },
          payload,
        ),
      ),
    );

    // Prune endpoints the push service has retired; count the rest as flaky.
    const dead: string[] = [];
    const flaky: string[] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") return;
      const status = (r.reason as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) dead.push(targets[i].endpoint);
      else flaky.push(targets[i].endpoint);
    });

    if (dead.length) {
      await supabase.from("push_subscriptions").delete().in("endpoint", dead);
    }
    if (flaky.length) {
      // Transient (network, push-service 5xx). Left in place deliberately —
      // deleting on a blip would silently unsubscribe a working driver, which
      // is the more expensive mistake. push_subscriptions.failure_count exists
      // for a retirement policy once we know what normal failure rates are.
      console.warn("[push] %d endpoint(s) failed transiently", flaky.length);
    }
  } catch (err) {
    console.error("[push] fan-out failed:", (err as Error).message);
  }
}
