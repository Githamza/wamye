// ============================================================
// Root layout for the driver dashboard, admin and auth pages.
//
// The second of two root layouts; the localised customer surface lives under
// [lang] with its own <html>. This group keeps unprefixed URLs (/dashboard,
// /login) because a driver's locale will come from their profile rather than
// the address bar — a signed-in tool has no reason to carry a locale in a link
// the way a shared shop page does.
//
// Hardcoded to French until that profile preference exists.
// ============================================================

import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/sonner";
import { fontVariables } from "@/app/fonts";
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

export default function AppRootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" dir="ltr" className={`${fontVariables} h-full antialiased`}>
      <body className="min-h-full bg-page">
        {children}
        <Toaster position="bottom-center" />
      </body>
    </html>
  );
}
