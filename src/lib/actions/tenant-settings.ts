"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncCompanyAdhocDistance } from "@/lib/tenant";
import { normalizePhone } from "@/lib/phone";

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

  // The quartier is a super-admin decision, not an owner's: it names the area
  // Wamye has opened, and the ordering page duplicated onto the next quartier
  // must not drift because a driver retitled their own. This form no longer
  // carries the field, so the stored value is read back and written through —
  // branding is a whole JSON column, and omitting a key deletes it.
  const { data: current } = await supabase
    .from("tenants")
    .select("branding")
    .eq("id", profile.tenantId)
    .maybeSingle();
  const areaLabel = (current?.branding as { areaLabel?: string } | null)
    ?.areaLabel;

  const branding = {
    name: String(formData.get("name") ?? "").trim(),
    areaLabel,
    // Normalised, never rejected: an owner clearing or fat-fingering their
    // support number must not block a zone or fee save. The number that has to
    // be valid is the one on their profile, which the Team page owns.
    supportPhone: normalizePhone(String(formData.get("supportPhone") ?? "")) || undefined,
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

  const { error } = await supabase
    .from("tenants")
    .update({ branding, zone, fee_config: feeConfig, hours, name: branding.name })
    .eq("id", profile.tenantId);
  if (error) redirect("/dashboard/settings?error=save");

  // Keep the Fleetbase company's driver-visibility radius in step with the zone
  // the owner just drew. Best-effort: a Fleetbase hiccup must not make the
  // settings save look like it failed — the zone itself is already persisted.
  await syncCompanyAdhocDistance(profile.tenantId, zone.radiusKm);

  revalidatePath("/dashboard/settings");
  revalidatePath(`/t/${profile.tenantId}`);
  // Same pattern as src/lib/actions/team.ts: the confirmation rides back on a
  // query param so the server-rendered page can show it without any client JS.
  redirect("/dashboard/settings?saved=1");
}
