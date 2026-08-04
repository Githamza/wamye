"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner, requireRole } from "@/lib/auth/dal";
import { sendAccountReadyEmail } from "@/lib/auth/approval-email";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidPhone, normalizePhone } from "@/lib/phone";
import { regenerateTeamInvite } from "@/lib/invites";

/**
 * Team management: a driver (tenant owner) runs a team of sub-drivers who
 * share their tenant. Sharing the tenant_id is what puts them on the same job
 * pool — the existing tenant-scoped RLS does the rest.
 *
 * Members arrive through an invitation link (src/lib/actions/join.ts) and land
 * 'pending'. THE OWNER accepts or refuses: they are the one who knows whether
 * this person really rides for them. A super-admin keeps the platform-level
 * levers (setMemberStatus, below) but is no longer in the hiring loop.
 */

/** Set the owner's own phone. Owners predate profiles.phone; members give
 *  theirs when they join. */
export async function updateOwnPhone(formData: FormData) {
  const owner = await requireOwner();
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  if (!isValidPhone(phone)) redirect("/dashboard/team?error=phone");

  const supabase = createAdminClient();
  await supabase.from("profiles").update({ phone }).eq("id", owner.id);

  revalidatePath("/dashboard/team");
}

/** Burn the team's invitation link and mint a fresh one. What an owner reaches
 *  for when the old link ended up somewhere it shouldn't have. */
export async function regenerateInvite() {
  const owner = await requireOwner();
  await regenerateTeamInvite(owner.tenantId, owner.id);
  revalidatePath("/dashboard/team");
  redirect("/dashboard/team?done=invite");
}

/** Look up a team member, proving they really belong to this owner. */
async function ownedSubDriver(ownerId: string, tenantId: string, id: string) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, tenant_id, parent_profile_id, status")
    .eq("id", id)
    .maybeSingle();

  // Never trust the id from the form: it must be this owner's own sub-driver.
  if (!data || data.parent_profile_id !== ownerId || data.tenant_id !== tenantId) {
    return null;
  }
  return data;
}

/**
 * Accept a join request. This is the moment the person becomes real to the
 * system: status 'active' is what makes current_tenant_id() resolve for them,
 * and so what opens the team's course feed.
 */
export async function approveTeamMember(formData: FormData) {
  const owner = await requireOwner();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const target = await ownedSubDriver(owner.id, owner.tenantId, id);
  if (!target) redirect("/dashboard/team?error=forbidden");
  if (target.status !== "pending") redirect("/dashboard/team?error=notPending");

  const supabase = createAdminClient();
  await supabase.from("profiles").update({ status: "active" }).eq("id", id);

  // Best effort — they can also just reload the dashboard they are sitting on.
  const { data } = await supabase.auth.admin.getUserById(id);
  if (data?.user?.email) await sendAccountReadyEmail(data.user.email, "approved");

  revalidatePath("/dashboard/team");
  redirect("/dashboard/team?done=approved");
}

/**
 * Refuse a join request: delete the login, which cascades the profile away.
 * Nothing is kept — the same person can re-apply with the same address, which
 * is the right outcome for a mistaken refusal.
 */
export async function rejectTeamMember(formData: FormData) {
  const owner = await requireOwner();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const target = await ownedSubDriver(owner.id, owner.tenantId, id);
  if (!target) redirect("/dashboard/team?error=forbidden");
  if (target.status !== "pending") redirect("/dashboard/team?error=notPending");

  const supabase = createAdminClient();
  await supabase.auth.admin.deleteUser(id);

  revalidatePath("/dashboard/team");
  redirect("/dashboard/team?done=rejected");
}

/** Suspend or re-activate one of the caller's sub-drivers. */
export async function toggleSubDriverActive(formData: FormData) {
  const owner = await requireOwner();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const target = await ownedSubDriver(owner.id, owner.tenantId, id);
  if (!target) redirect("/dashboard/team?error=forbidden");

  // A pending member is accepted or refused, not paused.
  if (target.status === "pending") redirect("/dashboard/team?error=notPending");

  const next = target.status === "active" ? "suspended" : "active";
  const supabase = createAdminClient();
  await supabase.from("profiles").update({ status: next }).eq("id", id);

  revalidatePath("/dashboard/team");
}

/** Remove a sub-driver entirely. Deleting the login cascades the profile. */
export async function removeSubDriver(formData: FormData) {
  const owner = await requireOwner();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const target = await ownedSubDriver(owner.id, owner.tenantId, id);
  if (!target) redirect("/dashboard/team?error=forbidden");

  const supabase = createAdminClient();
  await supabase.auth.admin.deleteUser(id);

  revalidatePath("/dashboard/team");
}

/**
 * Approve a pending member from the admin console (super-admin only).
 *
 * Kept alongside approveTeamMember, which is the normal path: this is the
 * override for when an owner is unreachable or a request is stuck.
 */
export async function approveSubDriver(formData: FormData) {
  await requireRole("super_admin");
  const id = String(formData.get("id") ?? "");
  const tenantId = String(formData.get("tenantId") ?? "");
  if (!id) return;

  const supabase = createAdminClient();
  await supabase.from("profiles").update({ status: "active" }).eq("id", id);

  const { data } = await supabase.auth.admin.getUserById(id);
  if (data?.user?.email) await sendAccountReadyEmail(data.user.email, "approved");

  revalidatePath("/dashboard/team");
  // Only ever submitted from the admin tenant page, which is where the
  // confirmation belongs; without a tenantId there is nowhere to send it.
  if (tenantId) {
    revalidatePath(`/admin/tenants/${tenantId}`);
    redirect(`/admin/tenants/${tenantId}?done=member-approved`);
  }
}

/** Suspend or re-activate any team member (super-admin only). */
export async function setMemberStatus(formData: FormData) {
  await requireRole("super_admin");
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  const tenantId = String(formData.get("tenantId") ?? "");
  if (!id || !["pending", "active", "suspended"].includes(status)) return;

  const supabase = createAdminClient();
  const { error } = await supabase.from("profiles").update({ status }).eq("id", id);
  if (error && tenantId) redirect(`/admin/tenants/${tenantId}?error=save`);

  revalidatePath("/dashboard/team");
  if (tenantId) {
    revalidatePath(`/admin/tenants/${tenantId}`);
    redirect(
      `/admin/tenants/${tenantId}?done=member-${status === "active" ? "activated" : "suspended"}`,
    );
  }
}
