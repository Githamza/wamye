"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/phone";

function num(v: FormDataEntryValue | null): number | null {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * Update branding / zone / hours for the caller's tenant. NOT the fee — see the
 * note above the write.
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
  const hours = {
    openHour: num(formData.get("openHour")) ?? 0,
    closeHour: num(formData.get("closeHour")) ?? 24,
    alwaysOpen: formData.get("alwaysOpen") === "on",
  };

  // fee_config is absent on purpose, and its absence is the whole guard: the
  // tarif is Wamye's (see updateTenantFees), so this action must not be able to
  // write it even if a forged POST carries baseFee/feePerKm/minFee. Unlike
  // areaLabel there is nothing to read back and write through — fee_config is
  // its own column, so leaving it out of the payload leaves it untouched.
  const { error } = await supabase
    .from("tenants")
    .update({ branding, zone, hours, name: branding.name })
    .eq("id", profile.tenantId);
  if (error) redirect("/dashboard/settings?error=save");

  // Nothing to mirror outwards: the zone drawn here is the whole truth about
  // where this tenant delivers. Which drivers get told about a course is a
  // separate question, answered by tenants.dispatch_radius_km against the
  // driver's own position — see push_targets() in migration 0019.

  revalidatePath("/dashboard/settings");
  revalidatePath(`/t/${profile.tenantId}`);
  // Same pattern as src/lib/actions/team.ts: the confirmation rides back on a
  // query param so the server-rendered page can show it without any client JS.
  redirect("/dashboard/settings?saved=1");
}
