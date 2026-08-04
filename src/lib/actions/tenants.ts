"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/dal";
import {
  sendAccountReadyEmail,
  tenantOwnerEmail,
} from "@/lib/auth/approval-email";
import { createAdminClient } from "@/lib/supabase/admin";
import { slugify } from "@/lib/slug";
import { normalizePhone } from "@/lib/phone";

function num(v: FormDataEntryValue | null, fallback: number): number {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Provision a new tenant (super-admin only): the tenant row and a tenant_admin
 * login. No password is handled here: the new admin gets an email whose link
 * lets them set one (sendAccountReadyEmail).
 */
export async function createTenant(formData: FormData) {
  await requireRole("super_admin");

  const slug = slugify(String(formData.get("slug") ?? ""));
  const name = String(formData.get("name") ?? "").trim();
  const adminEmail = String(formData.get("adminEmail") ?? "")
    .trim()
    .toLowerCase();

  if (!slug || !name || !adminEmail) {
    redirect("/admin/tenants/new?error=missing");
  }

  const supabase = createAdminClient();

  // Slug must be unique.
  const { data: existing } = await supabase
    .from("tenants")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (existing) redirect("/admin/tenants/new?error=slug");

  const branding = {
    name,
    logoEmoji: String(formData.get("logoEmoji") ?? "").trim() || "🛵",
    areaLabel: String(formData.get("areaLabel") ?? "").trim() || undefined,
    supportPhone:
      normalizePhone(String(formData.get("supportPhone") ?? "")) || undefined,
  };
  const zone = {
    centerLat: num(formData.get("centerLat"), 33.808),
    centerLng: num(formData.get("centerLng"), 10.995),
    radiusKm: num(formData.get("radiusKm"), 15),
  };
  const feeConfig = {
    baseFee: num(formData.get("baseFee"), 2.5),
    feePerKm: num(formData.get("feePerKm"), 0.6),
    minFee: num(formData.get("minFee"), 3),
  };
  const hours = {
    openHour: num(formData.get("openHour"), 8),
    closeHour: num(formData.get("closeHour"), 23),
    alwaysOpen: formData.get("alwaysOpen") === "on",
  };
  // 1. tenant row
  const { data: tenant, error: tErr } = await supabase
    .from("tenants")
    .insert({
      slug,
      name,
      branding,
      zone,
      fee_config: feeConfig,
      hours,
      phone_country: "TN",
      status: "active",
      is_active: true,
    })
    .select("id")
    .single();
  if (tErr || !tenant) redirect("/admin/tenants/new?error=insert");

  // 2. tenant_admin login (password set later via /auth/forgot)
  const { data: created, error: uErr } = await supabase.auth.admin.createUser({
    email: adminEmail,
    email_confirm: true,
  });
  if (!uErr && created?.user) {
    await supabase.from("profiles").upsert({
      id: created.user.id,
      tenant_id: tenant.id,
      role: "tenant_admin",
      name,
    });
    // The login has no password yet; the mail's link lets them set one.
    await sendAccountReadyEmail(adminEmail, "created");
  }

  revalidatePath("/admin");
  redirect(`/admin?created=${slug}`);
}

/** Enable/disable a tenant's public page (only meaningful once approved). */
/**
 * Set the quartier shown in the header of a tenant's ordering page.
 *
 * Super-admin only, and deliberately not on the owner's settings page: opening
 * a quartier is Wamye's call, and the page is meant to be duplicated onto the
 * next one with nothing but this label changing.
 */
export async function updateTenantArea(formData: FormData) {
  await requireRole("super_admin");
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/admin");

  const supabase = createAdminClient();
  const { data: t } = await supabase
    .from("tenants")
    .select("slug, branding")
    .eq("id", id)
    .maybeSingle();
  if (!t) redirect("/admin");

  // branding is one JSON column: merge, never replace, or the emoji and the
  // support number go with it.
  const branding = {
    ...((t.branding ?? {}) as Record<string, unknown>),
    areaLabel: String(formData.get("areaLabel") ?? "").trim() || undefined,
  };

  const { error } = await supabase
    .from("tenants")
    .update({ branding })
    .eq("id", id);
  if (error) redirect(`/admin/tenants/${id}?error=save`);

  revalidatePath(`/admin/tenants/${id}`);
  revalidatePath(`/t/${t.slug}`);
  redirect(`/admin/tenants/${id}?done=area`);
}

export async function toggleTenantActive(formData: FormData) {
  await requireRole("super_admin");
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  if (!id) return;

  const supabase = createAdminClient();
  const next = !active;
  const { error } = await supabase
    .from("tenants")
    .update({ is_active: next, status: next ? "active" : "suspended" })
    .eq("id", id);
  if (error) redirect(`/admin/tenants/${id}?error=save`);

  revalidatePath("/admin");
  revalidatePath(`/admin/tenants/${id}`);
  redirect(`/admin/tenants/${id}?done=${next ? "activated" : "suspended"}`);
}

/**
 * Approve a pending self-registered tenant (super-admin only).
 *
 * A status flip and an email, nothing else: the account lives entirely in
 * Supabase. Approval used to mint a Fleetbase company here — dropped, because
 * nothing reads that side and Fleetbase refuses to delete a company by API, so
 * every approval left a permanent, unusable record behind.
 */
export async function approveTenant(formData: FormData) {
  await requireRole("super_admin");
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = createAdminClient();

  const { error } = await supabase
    .from("tenants")
    .update({ status: "active", is_active: true })
    .eq("id", id);
  if (error) redirect(`/admin/tenants/${id}?error=save`);

  // Tell the owner their account is ready. No connection link any more: their
  // dashboard IS the driver app, and they are already signed in to it.
  const email = await tenantOwnerEmail(id);
  if (email) await sendAccountReadyEmail(email, "approved");

  revalidatePath("/admin");
  revalidatePath(`/admin/tenants/${id}`);
  redirect(`/admin/tenants/${id}?done=approved`);
}

