"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/dal";
import { sendAccountReadyEmail, tenantOwnerEmail } from "@/lib/auth/approval-email";
import { syncDriverToFleetbase } from "@/lib/actions/team";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret } from "@/lib/crypto";
import { slugify } from "@/lib/slug";
import { getTenantFleetbaseContext } from "@/lib/tenant";
import { navigatorConnectUrl } from "@/lib/navigator-link";
import {
  createFleetbaseClient,
  envFleetbaseContext,
  FleetbaseError,
} from "@/lib/fleetbase";

function num(v: FormDataEntryValue | null, fallback: number): number {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Provision a new tenant (super-admin only): the tenant row, its encrypted
 * Fleetbase key, and a tenant_admin login. No password is handled here: the
 * new admin gets an email whose link lets them set one (sendAccountReadyEmail).
 */
export async function createTenant(formData: FormData) {
  await requireRole("super_admin");

  const slug = slugify(String(formData.get("slug") ?? ""));
  const name = String(formData.get("name") ?? "").trim();
  const adminEmail = String(formData.get("adminEmail") ?? "").trim().toLowerCase();

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
    supportPhone: String(formData.get("supportPhone") ?? "").trim() || undefined,
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
  const apiUrl = String(formData.get("apiUrl") ?? "").trim() || null;
  const orderType = String(formData.get("orderType") ?? "").trim() || "storefront";
  const adhocDistanceRaw = String(formData.get("adhocDistance") ?? "").trim();
  const apiKey = String(formData.get("apiKey") ?? "").trim();

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
      fleetbase_api_url: apiUrl,
      fleetbase_order_type: orderType,
      fleetbase_adhoc_distance: adhocDistanceRaw ? Number(adhocDistanceRaw) : null,
      status: "active",
      is_active: true,
    })
    .select("id")
    .single();
  if (tErr || !tenant) redirect("/admin/tenants/new?error=insert");

  // 2. encrypted Fleetbase key (optional at creation)
  if (apiKey) {
    await supabase.from("tenant_secrets").insert({
      tenant_id: tenant.id,
      fleetbase_api_key_encrypted: encryptSecret(apiKey),
    });
  }

  // 3. tenant_admin login (password set later via /auth/forgot)
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
    // The login has no password yet; the mail's link lets them set one. The
    // Navigator link rides along — the admin is in practice the first driver.
    const connectUrl = await navigatorConnectUrl(tenant.id as string);
    await sendAccountReadyEmail(adminEmail, "created", connectUrl ?? undefined);
  }

  revalidatePath("/admin");
  redirect(`/admin?created=${slug}`);
}

/** Enable/disable a tenant's public page (only meaningful once approved). */
export async function toggleTenantActive(formData: FormData) {
  await requireRole("super_admin");
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  if (!id) return;

  const supabase = createAdminClient();
  const next = !active;
  await supabase
    .from("tenants")
    .update({ is_active: next, status: next ? "active" : "suspended" })
    .eq("id", id);
  revalidatePath("/admin");
  revalidatePath(`/admin/tenants/${id}`);
}

/** Approve a pending self-registered tenant (super-admin only). */
export async function approveTenant(formData: FormData) {
  await requireRole("super_admin");
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = createAdminClient();
  await supabase
    .from("tenants")
    .update({ status: "active", is_active: true })
    .eq("id", id);

  // Tell the owner their account is ready, with the Navigator connection
  // link as the next step (best effort, see helper).
  const email = await tenantOwnerEmail(id);
  if (email) {
    const connectUrl = await navigatorConnectUrl(id);
    await sendAccountReadyEmail(email, "approved", connectUrl ?? undefined);
  }

  // The owner is in practice the first driver, so put them in the Fleetbase
  // pool now rather than making them find the Team page. Best effort, same
  // rule as sub-driver approval: approval stands even if the sync fails — the
  // Team page keeps its retry button.
  const { data: owner } = await supabase
    .from("profiles")
    .select("id")
    .eq("tenant_id", id)
    .is("parent_profile_id", null)
    .maybeSingle();
  if (owner) await syncDriverToFleetbase(owner.id as string);

  revalidatePath("/admin");
  revalidatePath(`/admin/tenants/${id}`);
}

/**
 * Set a tenant's Fleetbase connection (super-admin only). The API key is
 * write-only + encrypted; leaving it blank keeps the stored one.
 */
export async function updateTenantFleetbase(formData: FormData) {
  await requireRole("super_admin");
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/admin");

  const supabase = createAdminClient();
  const apiUrl = String(formData.get("apiUrl") ?? "").trim() || null;
  const orderType = String(formData.get("orderType") ?? "").trim() || null;
  const adhocDistanceRaw = String(formData.get("adhocDistance") ?? "").trim();
  const newKey = String(formData.get("apiKey") ?? "").trim();

  await supabase
    .from("tenants")
    .update({
      fleetbase_api_url: apiUrl,
      fleetbase_order_type: orderType,
      fleetbase_adhoc_distance: adhocDistanceRaw ? Number(adhocDistanceRaw) : null,
    })
    .eq("id", id);

  if (newKey) {
    await supabase.from("tenant_secrets").upsert({
      tenant_id: id,
      fleetbase_api_key_encrypted: encryptSecret(newKey),
      updated_at: new Date().toISOString(),
    });
  }

  revalidatePath(`/admin/tenants/${id}`);
  redirect(`/admin/tenants/${id}?saved=1`);
}

/** How a connection test ended. A code, not a sentence — see SyncCode in
 *  @/lib/actions/team for why the server does not word these. */
export type TestCode = "connected" | "no-key" | "fleetbase-error" | "failed";

export type TestResult = {
  ok: boolean;
  code: TestCode;
  /** Upstream diagnostics for "fleetbase-error"; shown verbatim, never translated. */
  detail?: { status: number; message: string };
} | null;

/** "Test connection": validate a tenant's stored Fleetbase credentials. */
export async function testTenantConnection(tenantId: string): Promise<TestResult> {
  await requireRole("super_admin");
  const supabase = createAdminClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("slug")
    .eq("id", tenantId)
    .maybeSingle();

  const ctx = tenant?.slug
    ? (await getTenantFleetbaseContext(tenant.slug as string)) ?? envFleetbaseContext()
    : envFleetbaseContext();

  if (!ctx) return { ok: false, code: "no-key" };

  try {
    await createFleetbaseClient(ctx).ping();
    return { ok: true, code: "connected" };
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
