// ============================================================
// Root layout for the localised customer surface (/fr, /ar-TN/t/[slug], …).
//
// One of two root layouts — (app)/layout.tsx serves the driver dashboard and
// admin, which stay French and keep unprefixed URLs. Each root layout owns its
// own <html>, which is the whole point: `lang` and `dir` are attributes of the
// document, and a layout can only read the [lang] param if the segment sits
// above it. Navigating between the two groups costs a full page load, which is
// fine — it only happens at the login boundary.
// ============================================================

import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { NextIntlClientProvider } from "next-intl";
import { Toaster } from "@/components/ui/sonner";
import { fontVariables } from "@/app/fonts";
import { LOCALES, dirOf, hasLocale } from "@/i18n/locales";
import "../globals.css";

/** Prerender both locales rather than resolving the segment per request. */
export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata({
  params,
}: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const t = await getTranslations({ locale: lang, namespace: "Metadata" });

  return {
    title: t("title"),
    description: t("description"),
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, statusBarStyle: "default", title: "Wamye" },
  };
}

export const viewport: Viewport = {
  themeColor: "#0F766E",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default async function LocalisedRootLayout({
  children,
  params,
}: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  // [lang] catches every unmatched path, so this is also the 404 for /foo.
  if (!hasLocale(lang)) notFound();

  // next-intl reads the locale from here. Its own middleware would normally
  // pass it via a header, but this app routes locales in proxy.ts; without
  // this call next-intl would fall back to headers() and opt every page into
  // dynamic rendering.
  setRequestLocale(lang);

  return (
    <html
      lang={lang}
      dir={dirOf(lang)}
      className={`${fontVariables} h-full antialiased`}
    >
      <body className="min-h-full bg-page">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        <Toaster position="bottom-center" />
      </body>
    </html>
  );
}
