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
import { NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { Toaster } from "@/components/ui/sonner";
import { Clarity } from "@/components/clarity";
import { fontVariables } from "@/app/fonts";
import { dirOf } from "@/i18n/locales";
import { viewerLocale } from "@/i18n/viewer-locale";
import "../globals.css";

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
        <Clarity />
      </body>
    </html>
  );
}
