"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth/dal";
import { createAdminClient } from "@/lib/supabase/admin";

function num(v: FormDataEntryValue | null): number | null {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * Update branding / zone / fee / hours for the caller's tenant. Fleetbase is
 * intentionally NOT editable here — a super-admin owns it (see
 * src/lib/actions/tenants.ts: updateTenantFleetbase).
 *
 * requireOwner, not requireTenant: this writes with the service-role client, so
 * RLS is not a second line of defence — this guard is the only one. A sub-driver
 * reaching it could rewrite the business's zone and fees.
 */
export async function updateGeneral(formData: FormData) {
  const profile = await requireOwner();
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
