import { NextResponse } from "next/server";
import { getPageConfig } from "@/lib/tenant";
import { hasLocale, DEFAULT_LOCALE } from "@/i18n/locales";

/**
 * A web app manifest per commerce.
 *
 * A customer adds the page they are on — their shop's ordering page — and the
 * icon has to reopen that shop. The single static manifest had start_url "/",
 * so every install landed on the directory of every tenant instead: the wrong
 * shop, or none.
 *
 * A route handler rather than the app/manifest.ts convention, which is
 * root-only and cannot vary by slug.
 *
 * `id` is what makes two installs distinct — a customer who orders from two
 * shops gets two icons, each opening its own. It must stay stable for the life
 * of the tenant: change it and every existing install silently orphans.
 */

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  props: { params: Promise<{ slug: string }> },
) {
  const { slug } = await props.params;
  const config = await getPageConfig(slug);
  if (!config) return new NextResponse(null, { status: 404 });

  const raw = new URL(request.url).searchParams.get("lang");
  const lang = hasLocale(raw) ? raw : DEFAULT_LOCALE;
  const home = `/${lang}/t/${slug}`;
  const name = config.branding.name;

  return NextResponse.json(
    {
      id: `/t/${slug}`,
      name: `${name} — Commander`,
      short_name: name.slice(0, 12),
      description: config.branding.areaLabel
        ? `Livraison à ${config.branding.areaLabel}. Payez à la livraison.`
        : "Commandez, un livreur vous livre. Payez à la livraison.",
      start_url: home,
      // Deliberately the whole origin, not just the shop page: a narrow scope
      // hands any navigation outside it to a browser tab, which throws the
      // customer out of the app they just installed. `id` keeps the installs
      // apart; scope only decides what stays inside the shell.
      scope: "/",
      display: "standalone",
      orientation: "portrait",
      background_color: "#FAFAF9",
      theme_color: "#0F766E",
      lang,
      dir: lang === "ar-TN" ? "rtl" : "ltr",
      icons: [
        {
          src: "/icons/icon-192.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "any",
        },
        {
          src: "/icons/icon-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "any",
        },
        {
          src: "/icons/icon-maskable-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    },
    {
      headers: {
        "content-type": "application/manifest+json; charset=utf-8",
        // Tenants rename themselves; a stale manifest would keep the old name
        // on the home screen for anyone installing today.
        "cache-control": "public, max-age=300",
      },
    },
  );
}
