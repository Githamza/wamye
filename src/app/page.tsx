import { redirect } from "next/navigation";
import { DEFAULT_TENANT_CONFIG } from "@/lib/default-config";

// The root currently sends visitors to the default tenant's ordering page so
// the live URL keeps working. A marketing/landing page will replace this once
// the platform hosts multiple tenants.
export default function RootPage() {
  redirect(`/t/${DEFAULT_TENANT_CONFIG.slug}`);
}
