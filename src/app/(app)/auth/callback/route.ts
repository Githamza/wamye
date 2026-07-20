import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// OAuth (e.g. Google) redirect target: exchange the code for a session cookie,
// then continue to the intended page.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const nextRaw = searchParams.get("next");
  const next = nextRaw && nextRaw.startsWith("/") ? nextRaw : "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    // Relative Location: resolved against the public origin by the browser,
    // not the proxy's internal host (0.0.0.0:3000).
    if (!error)
      return new NextResponse(null, { status: 303, headers: { Location: next } });
  }

  return new NextResponse(null, { status: 303, headers: { Location: "/login" } });
}
