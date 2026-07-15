import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrderApp } from "@/components/order-app";
import { getPageConfig } from "@/lib/tenant";

// The tenant's config is loaded per request; never statically cached.
export const dynamic = "force-dynamic";

export async function generateMetadata(
  props: PageProps<"/t/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const config = await getPageConfig(slug);
  if (!config) return { title: "Introuvable" };
  return {
    title: `${config.branding.name} — Commander`,
    description: `Commande et livraison — ${config.branding.areaLabel ?? config.branding.name}`,
  };
}

export default async function TenantOrderPage(props: PageProps<"/t/[slug]">) {
  const { slug } = await props.params;
  const config = await getPageConfig(slug);
  if (!config) notFound();
  return <OrderApp config={config} />;
}
