"use server";

import { requireTenant } from "@/lib/auth/dal";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Push subscription lifecycle.
 *
 * Written with the admin client because push_subscriptions has RLS on and no
 * policies (migration 0013) — the endpoint plus its keys are a send capability
 * and nothing in the browser needs to read them back. The profile_id comes
 * from the DAL, never from the submitted payload.
 */

export type PushCode = "ok" | "invalid" | "failed";

/** The browser's PushSubscription, as JSON. */
type SubscriptionJson = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

export async function savePushSubscription(
  subscription: SubscriptionJson,
  userAgent?: string,
): Promise<{ ok: boolean; code: PushCode }> {
  const profile = await requireTenant();

  const endpoint = subscription?.endpoint;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;
  if (!endpoint || !p256dh || !auth) return { ok: false, code: "invalid" };

  const supabase = createAdminClient();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      profile_id: profile.id,
      tenant_id: profile.tenantId,
      endpoint,
      p256dh,
      auth,
      user_agent: userAgent ?? null,
      failure_count: 0,
      last_used_at: new Date().toISOString(),
    },
    // The endpoint is the identity: the same device re-subscribing must update
    // its row, not create a duplicate that would double every notification.
    { onConflict: "endpoint" },
  );

  if (error) {
    console.error("[push] subscribe failed:", error.message);
    return { ok: false, code: "failed" };
  }
  return { ok: true, code: "ok" };
}

export async function deletePushSubscription(
  endpoint: string,
): Promise<{ ok: boolean; code: PushCode }> {
  const profile = await requireTenant();
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    // Scoped to the caller so an endpoint string alone cannot unsubscribe
    // somebody else.
    .eq("profile_id", profile.id);

  if (error) {
    console.error("[push] unsubscribe failed:", error.message);
    return { ok: false, code: "failed" };
  }
  return { ok: true, code: "ok" };
}
