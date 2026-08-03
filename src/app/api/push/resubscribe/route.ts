import { NextResponse } from "next/server";
import { getSessionUser, getProfile } from "@/lib/auth/dal";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Called by the service worker's `pushsubscriptionchange` handler.
 *
 * A Route Handler rather than a Server Action: the caller is the service
 * worker, which has no React runtime to dispatch an action from.
 *
 * Chrome rotates subscriptions on its own schedule. Without this the driver
 * goes silently deaf and nothing anywhere reports it.
 */

export const dynamic = "force-dynamic";

type Body = {
  oldEndpoint?: string | null;
  subscription?: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
};

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const profile = await getProfile();
  if (!profile?.tenantId) return new NextResponse(null, { status: 403 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const endpoint = body.subscription?.endpoint;
  const p256dh = body.subscription?.keys?.p256dh;
  const auth = body.subscription?.keys?.auth;
  if (!endpoint || !p256dh || !auth)
    return new NextResponse(null, { status: 400 });

  const supabase = createAdminClient();

  if (body.oldEndpoint && body.oldEndpoint !== endpoint) {
    await supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", body.oldEndpoint)
      .eq("profile_id", profile.id);
  }

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      profile_id: profile.id,
      tenant_id: profile.tenantId,
      endpoint,
      p256dh,
      auth,
      failure_count: 0,
      last_used_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    console.error("[push] resubscribe failed:", error.message);
    return new NextResponse(null, { status: 500 });
  }
  return new NextResponse(null, { status: 204 });
}
