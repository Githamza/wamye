import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { OrderApp } from "@/components/order-app";
import { getPageConfig } from "@/lib/tenant";
import { hasLocale } from "@/i18n/locales";

// The tenant's config is loaded per request; never statically cached.
export const dynamic = "force-dynamic";

export async function generateMetadata(
  props: PageProps<"/[lang]/t/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const config = await getPageConfig(slug);
  if (!config) return { title: "Introuvable" };
  return {
    title: `${config.branding.name} — Commander`,
    description: `Commande et livraison — ${config.branding.areaLabel ?? config.branding.name}`,
  };
}

export default async function TenantOrderPage(props: PageProps<"/[lang]/t/[slug]">) {
  const { lang, slug } = await props.params;
  if (!hasLocale(lang)) notFound();
  setRequestLocale(lang);

  const config = await getPageConfig(slug);
  if (!config) notFound();
  return <OrderApp config={config} />;
}
