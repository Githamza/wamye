import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // Relative Location: the browser resolves it against the public origin,
  // so the proxy's internal host (0.0.0.0:3000) never leaks into the redirect.
  return new NextResponse(null, { status: 303, headers: { Location: "/login" } });
}
