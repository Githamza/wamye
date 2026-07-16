import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

// Platform-level defaults. Each tenant's ordering page overrides the title
// with its own branding via generateMetadata (see app/t/[slug]/page.tsx).
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full bg-page">
        {children}
        <Toaster position="bottom-center" />
      </body>
    </html>
  );
}
