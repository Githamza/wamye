// ============================================================
// Root layout for the driver dashboard, admin and auth pages.
//
// The second of two root layouts; the localised customer surface lives under
// [lang] with its own <html>. This group keeps unprefixed URLs (/dashboard,
// /login) because a driver's locale comes from their profile rather than the
// address bar — a signed-in tool is nobody's shared link, so there is nothing
// for a locale in the URL to carry.
// ============================================================

import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { Toaster } from "@/components/ui/sonner";
import { fontVariables } from "@/app/fonts";
import { getProfile } from "@/lib/auth/dal";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  dirOf,
  hasLocale,
  type Locale,
} from "@/i18n/locales";
import "../globals.css";

/**
 * The language to render in, in order of authority:
 *
 *   1. the signed-in driver's saved preference;
 *   2. the cookie, for /login and /signup — there is no profile to read yet,
 *      and someone who just browsed a shop in derja should not be handed a
 *      French sign-in form;
 *   3. French.
 *
 * getProfile is memoized per render, so pages that already call require* pay
 * for this once.
 */
async function viewerLocale(): Promise<Locale> {
  const profile = await getProfile();
  if (profile) return profile.locale;

  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  return hasLocale(chosen) ? chosen : DEFAULT_LOCALE;
}

// Platform-level defaults. Each tenant's ordering page overrides the title
// with its own branding via generateMetadata (see app/[lang]/t/[slug]/page.tsx).
export const metadata: Metadata = {
  title: "Wamye — Livraison en Tunisie",
  description:
    "Trouvez un livreur près de chez vous. Repas, courses, pharmacie : un livreur confirme le prix avant achat, vous payez à la livraison.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Wamye",
  },
};

export const viewport: Viewport = {
  themeColor: "#0F766E",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default async function AppRootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await viewerLocale();
  // next-intl reads the locale from here; without it the request config would
  // fall back to the default and every message would come out French.
  setRequestLocale(locale);

  return (
    <html
      lang={locale}
      dir={dirOf(locale)}
      className={`${fontVariables} h-full antialiased`}
    >
      <body className="min-h-full bg-page">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        <Toaster position="bottom-center" />
      </body>
    </html>
  );
}
