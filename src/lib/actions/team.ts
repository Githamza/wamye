"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getProfile, requireOwner, requireRole } from "@/lib/auth/dal";
import { sendAccountReadyEmail } from "@/lib/auth/approval-email";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantFleetbaseContext } from "@/lib/tenant";
import { toInternationalPhone } from "@/lib/phone";
import { createFleetbaseClient, FleetbaseError } from "@/lib/fleetbase";
import { navigatorConnectUrl } from "@/lib/navigator-link";

/**
 * Team management: a driver (tenant owner) adds sub-drivers who share their
 * tenant. Sharing the tenant_id is what puts them on the same job pool — the
 * existing tenant-scoped RLS does the rest.
 *
 * A sub-driver starts 'pending' and a super-admin approves them, exactly like
 * a self-registered driver. The owner vouches; the platform decides.
 */

/**
 * How a sync ended. A code rather than a sentence: a server action has no
 * locale, so returning French text from here would pin the UI to French no
 * matter what the reader asked for. The client owns the wording.
 */
export type SyncCode =
  | "created"
  | "linked"
  | "already-synced"
  | "member-not-found"
  | "forbidden"
  | "phone-missing"
  | "no-fleetbase-key"
  | "email-not-found"
  | "fleetbase-error"
  | "failed";

export type SyncResult = {
  ok: boolean;
  code: SyncCode;
  /**
   * Upstream diagnostics, present only for "fleetbase-error". Not translated
   * on purpose: it is another system's error text, shown verbatim so a failed
   * sync can actually be debugged.
   */
  detail?: { status: number; message: string };
} | null;

/**
 * Add a sub-driver to the caller's team. Creates the login directly with an
 * owner-chosen password (no invite email); the sub-driver signs in at /login
 * and waits on /pending until approved.
 */
export async function addSubDriver(formData: FormData) {
  const owner = await requireOwner();

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!name || !email || !phone || password.length < 8) {
    redirect("/dashboard/team?error=missing");
  }

  const supabase = createAdminClient();

  const { data: created, error: uErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (uErr || !created?.user) {
    redirect("/dashboard/team?error=email");
  }

  const { error: pErr } = await supabase.from("profiles").insert({
    id: created.user.id,
    tenant_id: owner.tenantId,
    role: "tenant_admin",
    name,
    phone,
    parent_profile_id: owner.id,
    status: "pending",
  });
  if (pErr) {
    // Roll back the orphaned login so a retry with the same email is clean.
    await supabase.auth.admin.deleteUser(created.user.id);
    redirect("/dashboard/team?error=insert");
  }

  // NOTE: deliberately no signInWithPassword here. signupDriver ends by signing
  // the new user in, but copying that would swap the owner's session for their
  // sub-driver's — the owner must stay signed in as themselves.

  revalidatePath("/dashboard/team");
  redirect("/dashboard/team?added=1");
}

/**
 * Set the owner's own phone. Needed because owners predate profiles.phone and
 * Fleetbase requires a number to register them as a driver (decision: the boss
 * is in the pool too). Sub-drivers get their number at creation.
 */
export async function updateOwnPhone(formData: FormData) {
  const owner = await requireOwner();
  const phone = String(formData.get("phone") ?? "").trim();
  if (!phone) redirect("/dashboard/team?error=missing");

  const supabase = createAdminClient();
  await supabase.from("profiles").update({ phone }).eq("id", owner.id);

  revalidatePath("/dashboard/team");
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

/** Suspend or re-activate one of the caller's sub-drivers. */
export async function toggleSubDriverActive(formData: FormData) {
  const owner = await requireOwner();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const target = await ownedSubDriver(owner.id, owner.tenantId, id);
  if (!target) redirect("/dashboard/team?error=forbidden");

  // An owner may pause/resume a member, but cannot approve one — only a
  // super-admin can move them out of 'pending'.
  if (target.status === "pending") redirect("/dashboard/team?error=pending");

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

  // Their Fleetbase driver record is left in place — removing it is a separate
  // concern and must not block the removal here.
  revalidatePath("/dashboard/team");
}

/**
 * Register a team member (owner or sub-driver) as a driver in the tenant's
 * Fleetbase company, putting them in its adhoc broadcast pool.
 *
 * Returns a result instead of throwing: this is called from approval and from
 * a retry button, and a Fleetbase outage must never break either.
 */
export async function syncDriverToFleetbase(profileId: string): Promise<SyncResult> {
  const supabase = createAdminClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, tenant_id, name, phone, fleetbase_driver_id")
    .eq("id", profileId)
    .maybeSingle();
  if (!profile) return { ok: false, code: "member-not-found" };

  // A super-admin may sync anyone; an owner only their own team.
  if (!(await canManageTeam(profile.tenant_id as string))) {
    return { ok: false, code: "forbidden" };
  }

  if (profile.fleetbase_driver_id) {
    return { ok: true, code: "already-synced" };
  }
  if (!profile.phone) {
    return { ok: false, code: "phone-missing" };
  }

  const { data: tenant } = await supabase
    .from("tenants")
    .select("slug, phone_country")
    .eq("id", profile.tenant_id)
    .maybeSingle();

  // NO env-key fallback here, deliberately — unlike testTenantConnection, which
  // may fall back because ping() only reads. Creating a driver is a WRITE: with
  // the shared env key it would file this person into whatever company that key
  // owns, i.e. another tenant's dispatch pool. A tenant with no key of its own
  // must fail loudly instead.
  const ctx = tenant?.slug
    ? await getTenantFleetbaseContext(tenant.slug as string)
    : null;
  if (!ctx) {
    return { ok: false, code: "no-fleetbase-key" };
  }

  // Fleetbase requires an email; a driver's login email is the natural one.
  const { data: authUser } = await supabase.auth.admin.getUserById(profileId);
  const email = authUser?.user?.email;
  if (!email) return { ok: false, code: "email-not-found" };

  const fleetbase = createFleetbaseClient(ctx);
  try {
    let driver: { id: string };
    let code: SyncCode = "created";
    try {
      driver = await fleetbase.createDriver({
        name: (profile.name as string | null) ?? email,
        email,
        phone: toInternationalPhone(
          profile.phone as string,
          (tenant?.phone_country as string | null) ?? "TN",
        ),
      });
    } catch (err) {
      // "Email already taken" means Fleetbase knows this person — typically
      // the owner, whose address was used for the company's admin user. If a
      // driver record already exists for it, adopt that record instead of
      // failing; if only the *user* exists, rethrow so the 422 stays visible.
      if (!(err instanceof FleetbaseError) || err.status !== 422) throw err;
      const existing = await fleetbase.findDriverByEmail(email);
      if (!existing) throw err;
      driver = existing;
      code = "linked";
    }

    await supabase
      .from("profiles")
      .update({ fleetbase_driver_id: driver.id })
      .eq("id", profileId);

    revalidatePath("/dashboard/team");
    revalidatePath(`/admin/tenants/${profile.tenant_id}`);
    return { ok: true, code };
  } catch (err) {
    return err instanceof FleetbaseError
      ? {
          ok: false,
          code: "fleetbase-error",
          detail: { status: err.status, message: err.message },
        }
      : { ok: false, code: "failed" };
  }
}

/** True when the caller is a super-admin, or the approved owner of `tenantId`. */
async function canManageTeam(tenantId: string): Promise<boolean> {
  const profile = await getProfile();
  if (!profile) return false;
  if (profile.role === "super_admin") return true;
  return profile.isOwner && profile.status === "active" && profile.tenantId === tenantId;
}

/** Approve a pending sub-driver (super-admin only), then try to put them in
 *  the tenant's Fleetbase pool. Approval stands even if that sync fails. */
export async function approveSubDriver(formData: FormData) {
  await requireRole("super_admin");
  const id = String(formData.get("id") ?? "");
  const tenantId = String(formData.get("tenantId") ?? "");
  if (!id) return;

  const supabase = createAdminClient();
  await supabase.from("profiles").update({ status: "active" }).eq("id", id);

  // Best effort: the retry button on the team list covers a failure here.
  await syncDriverToFleetbase(id);

  // Tell the driver their account is ready, with the tenant's Navigator
  // connection link as the next step (best effort, see helper).
  const { data } = await supabase.auth.admin.getUserById(id);
  if (data?.user?.email) {
    // The profile's tenant_id, not the form's: the form value is display
    // routing only and may be absent.
    const { data: prof } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", id)
      .maybeSingle();
    const connectUrl = prof?.tenant_id
      ? await navigatorConnectUrl(prof.tenant_id as string)
      : null;
    await sendAccountReadyEmail(data.user.email, "approved", connectUrl ?? undefined);
  }

  revalidatePath("/dashboard/team");
  if (tenantId) revalidatePath(`/admin/tenants/${tenantId}`);
}

/** Suspend or re-activate any team member (super-admin only). */
export async function setMemberStatus(formData: FormData) {
  await requireRole("super_admin");
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  const tenantId = String(formData.get("tenantId") ?? "");
  if (!id || !["pending", "active", "suspended"].includes(status)) return;

  const supabase = createAdminClient();
  await supabase.from("profiles").update({ status }).eq("id", id);

  revalidatePath("/dashboard/team");
  if (tenantId) revalidatePath(`/admin/tenants/${tenantId}`);
}
