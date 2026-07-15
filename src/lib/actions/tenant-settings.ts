"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/auth/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret } from "@/lib/crypto";
import {
  createFleetbaseClient,
  envFleetbaseContext,
  FleetbaseError,
} from "@/lib/fleetbase";
import { getTenantFleetbaseContext } from "@/lib/tenant";

function num(v: FormDataEntryValue | null): number | null {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : null;
}

/** Update branding / zone / fee / hours for the caller's tenant. */
export async function updateGeneral(formData: FormData) {
  const profile = await requireTenant();
  const supabase = createAdminClient();

  const branding = {
    name: String(formData.get("name") ?? "").trim(),
    areaLabel: String(formData.get("areaLabel") ?? "").trim() || undefined,
    supportPhone: String(formData.get("supportPhone") ?? "").trim() || undefined,
    logoEmoji: String(formData.get("logoEmoji") ?? "").trim() || undefined,
  };
  const zone = {
    centerLat: num(formData.get("centerLat")) ?? 0,
    centerLng: num(formData.get("centerLng")) ?? 0,
    radiusKm: num(formData.get("radiusKm")) ?? 10,
  };
  const feeConfig = {
    baseFee: num(formData.get("baseFee")) ?? 0,
    feePerKm: num(formData.get("feePerKm")) ?? 0,
    minFee: num(formData.get("minFee")) ?? 0,
  };
  const hours = {
    openHour: num(formData.get("openHour")) ?? 0,
    closeHour: num(formData.get("closeHour")) ?? 24,
    alwaysOpen: formData.get("alwaysOpen") === "on",
  };

  await supabase
    .from("tenants")
    .update({ branding, zone, fee_config: feeConfig, hours, name: branding.name })
    .eq("id", profile.tenantId);

  revalidatePath("/dashboard/settings");
  revalidatePath(`/t/${profile.tenantId}`);
}

/** Update Fleetbase connection settings; the API key is write-only + encrypted. */
export async function updateFleetbase(formData: FormData) {
  const profile = await requireTenant();
  const supabase = createAdminClient();

  const apiUrl = String(formData.get("apiUrl") ?? "").trim() || null;
  const orderType = String(formData.get("orderType") ?? "").trim() || null;
  const adhocDistance = num(formData.get("adhocDistance"));
  const newKey = String(formData.get("apiKey") ?? "").trim();

  await supabase
    .from("tenants")
    .update({
      fleetbase_api_url: apiUrl,
      fleetbase_order_type: orderType,
      fleetbase_adhoc_distance: adhocDistance,
    })
    .eq("id", profile.tenantId);

  // Only rewrite the key when a new one was entered (the field renders blank).
  if (newKey) {
    await supabase.from("tenant_secrets").upsert({
      tenant_id: profile.tenantId,
      fleetbase_api_key_encrypted: encryptSecret(newKey),
      updated_at: new Date().toISOString(),
    });
  }

  revalidatePath("/dashboard/settings");
}

export type TestResult = { ok: boolean; message: string } | null;

/** "Test connection": validate the tenant's stored Fleetbase credentials. */
export async function testConnection(): Promise<TestResult> {
  const profile = await requireTenant();
  const supabase = createAdminClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("slug")
    .eq("id", profile.tenantId)
    .maybeSingle();

  const ctx = tenant?.slug
    ? (await getTenantFleetbaseContext(tenant.slug as string)) ?? envFleetbaseContext()
    : envFleetbaseContext();

  if (!ctx) return { ok: false, message: "Aucune clé Fleetbase configurée." };

  try {
    await createFleetbaseClient(ctx).ping();
    return { ok: true, message: "Connexion réussie ✓" };
  } catch (err) {
    const msg =
      err instanceof FleetbaseError
        ? `Échec (${err.status}) : ${err.message}`
        : "Échec de la connexion.";
    return { ok: false, message: msg };
  }
}
