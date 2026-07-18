// ============================================================
// Proxy (Next.js 16's renamed Middleware). Runs on the Node.js runtime.
//
// Two unrelated jobs, split by path:
//
//   1. PUBLIC (/ and /t/[slug]) — send the visitor to a locale-prefixed URL.
//      No Supabase call happens on this branch, deliberately: these pages are
//      unauthenticated and a session round-trip would tax every shop link for
//      nothing.
//
//   2. PROTECTED (/dashboard, /admin) — refresh the Supabase session cookie
//      and bounce signed-out visitors to /login. OPTIMISTIC only; the real
//      enforcement is the DAL in src/lib/auth/dal.ts, called inside each
//      protected page/action.
//
// The locale redirect is also what keeps already-shared /t/[slug] links alive
// now that the pages live under /[lang]/t/[slug].
// ============================================================

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, LOCALE_COOKIE, hasLocale, type Locale } from "@/i18n/locales";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/dashboard") || pathname.startsWith("/admin")) {
    return authenticate(request);
  }
  return redirectToLocale(request, pathname);
}

// ---- 1. public: locale routing ----

/** A year: long enough that a reader sets this once and forgets it. */
const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function redirectToLocale(request: NextRequest, pathname: string) {
  const locale = preferredLocale(request);
  const url = request.nextUrl.clone();
  // "/" becomes "/fr", not "/fr/"; "/t/x" becomes "/fr/t/x".
  url.pathname = pathname === "/" ? `/${locale}` : `/${locale}${pathname}`;
  const response = NextResponse.redirect(url);
  // Persist the resolved locale. The [lang] surface reads its language from the
  // URL, but the (app) group (/login, /signup) reads it from this cookie — so
  // without writing it here, a visitor sent to /ar-TN by Accept-Language would
  // arrive at /login with no cookie and be handed a French form. Idempotent:
  // preferredLocale already prefers the cookie, so this only fills the gap left
  // by the implicit (Accept-Language) guess.
  response.cookies.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax",
  });
  return response;
}

function preferredLocale(request: NextRequest): Locale {
  // An explicit choice outranks the browser's guess.
  const chosen = request.cookies.get(LOCALE_COOKIE)?.value;
  if (hasLocale(chosen)) return chosen;
  return fromAcceptLanguage(request.headers.get("accept-language"));
}

/**
 * Picks a locale from an Accept-Language header, honouring q-weights.
 *
 * Hand-rolled rather than pulling in Negotiator and intl-localematcher, which
 * the Next.js guide suggests: with two locales and a hard default, matching is
 * a lookup, not a negotiation.
 */
function fromAcceptLanguage(header: string | null): Locale {
  if (!header) return DEFAULT_LOCALE;

  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      return {
        tag: tag.trim().toLowerCase(),
        q: q ? Number(q.split("=")[1]) || 0 : 1,
      };
    })
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    // Any Arabic maps to derja. The readers are Tunisian and no other Arabic
    // is on offer, so ar-EG is better served derja than French.
    if (tag === "ar" || tag.startsWith("ar-")) return "ar-TN";
    if (tag === "fr" || tag.startsWith("fr-")) return "fr";
  }
  return DEFAULT_LOCALE;
}

// ---- 2. protected: supabase session ----

async function authenticate(request: NextRequest) {
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
  // Only the four shapes above. Anything already carrying a locale (/fr/…)
  // needs no redirect, so it never reaches the proxy at all.
  matcher: ["/", "/t/:path*", "/dashboard/:path*", "/admin/:path*"],
};
