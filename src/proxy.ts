// ============================================================
// Proxy (Next.js 16's renamed Middleware). Runs on the Node.js runtime.
//
// Two jobs, both OPTIMISTIC (the real enforcement is the DAL in
// src/lib/auth/dal.ts, called inside each protected page/action):
//   1. Refresh the Supabase auth session cookie on dashboard/admin routes.
//   2. Redirect signed-out visitors away from those routes to /login.
//
// Scoped by `config.matcher` to /dashboard and /admin only, so the public
// ordering pages (/t/[slug]) and the API stay untouched and fast.
// ============================================================

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  // Inert until Supabase is configured (keeps /dashboard from 500-ing before
  // the anon key is set).
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANT: getUser() refreshes the session; do not run code between
  // createServerClient and getUser (Supabase SSR guidance).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};
