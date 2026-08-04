"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/dal";
import {
  sendAccountReadyEmail,
  tenantOwnerEmail,
} from "@/lib/auth/approval-email";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret } from "@/lib/crypto";
import { slugify } from "@/lib/slug";
import { normalizePhone, toInternationalPhone } from "@/lib/phone";
import {
  getTenantFleetbaseContext,
  syncCompanyAdhocDistance,
} from "@/lib/tenant";
import {
  createFleetbaseClient,
  envFleetbaseContext,
  FleetbaseError,
} from "@/lib/fleetbase";
import {
  isFleetbaseAdminConfigured,
  provisionCompany,
} from "@/lib/fleetbase-admin";

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
  const apiUrl = String(formData.get("apiUrl") ?? "").trim() || null;
  const orderType =
    String(formData.get("orderType") ?? "").trim() || "storefront";
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

/** How a provisioning attempt ended — a code, not a sentence (see TestCode). */
export type ProvisionCode =
  | "provisioned"
  | "already-provisioned"
  | "not-configured"
  | "tenant-not-found"
  | "failed";

export type ProvisionResult = {
  ok: boolean;
  code: ProvisionCode;
  /** Upstream diagnostics for "failed"; shown verbatim, never translated. */
  detail?: string;
} | null;

/**
 * Give a tenant its own Fleetbase company: create the organization, mint its
 * API key, store the key encrypted, and open the company's adhoc radius to the
 * tenant's zone.
 *
 * Idempotent by the only test that matters — an existing stored key. A tenant
 * whose key was pasted by hand is left alone, and a retry after a half-failure
 * never mints a second company, because the key is written in the same step.
 *
 * Never throws: provisioning is best-effort inside approval (a Fleetbase
 * outage must not block validating an account), and the admin page exposes an
 * explicit retry — the same rule as syncDriverToFleetbase.
 */
async function provisionTenantFleetbase(id: string): Promise<ProvisionResult> {
  if (!isFleetbaseAdminConfigured())
    return { ok: false, code: "not-configured" };

  const supabase = createAdminClient();
  const { data: t } = await supabase
    .from("tenants")
    .select("name, slug, branding, zone, phone_country, fleetbase_api_url")
    .eq("id", id)
    .maybeSingle();
  if (!t) return { ok: false, code: "tenant-not-found" };

  const { data: existing } = await supabase
    .from("tenant_secrets")
    .select("tenant_id")
    .eq("tenant_id", id)
    .maybeSingle();
  if (existing) return { ok: true, code: "already-provisioned" };

  try {
    const branding = (t.branding ?? {}) as { supportPhone?: string };
    const apiUrl = (t.fleetbase_api_url as string | null) ?? undefined;
    const country = (t.phone_country as string | null) ?? "TN";

    // Same normalisation as the driver record: the signup field is free text,
    // so the support number arrives as +216…, 216…, 00216… or 8 bare digits.
    const phone = branding.supportPhone
      ? toInternationalPhone(branding.supportPhone, country)
      : undefined;

    const company = await provisionCompany(t.name as string, {
      description: `Wamye · /t/${t.slug}`,
      phone: phone || undefined,
      country,
      apiUrl,
    });
    if (!company) return { ok: false, code: "not-configured" };

    // The key first and on its own: it is returned exactly once, so anything
    // that could fail before it is stored would strand a live company nobody
    // can reach (Fleetbase does not allow deleting one either).
    const { error: sErr } = await supabase.from("tenant_secrets").upsert({
      tenant_id: id,
      fleetbase_api_key_encrypted: encryptSecret(company.apiKey),
      updated_at: new Date().toISOString(),
    });
    if (sErr) throw new Error(`storing the key failed: ${sErr.message}`);

    await supabase
      .from("tenants")
      .update({ fleetbase_company_id: company.companyId })
      .eq("id", id);

    // A new company defaults to a 6 km adhoc radius, which would hide most of
    // the tenant's own zone from its drivers. See adhocDistanceForZone.
    const radiusKm = (t.zone as { radiusKm?: number } | null)?.radiusKm;
    if (typeof radiusKm === "number")
      await syncCompanyAdhocDistance(id, radiusKm);

    return { ok: true, code: "provisioned" };
  } catch (err) {
    console.error("[tenants] provisioning failed:", (err as Error).message);
    return { ok: false, code: "failed", detail: (err as Error).message };
  }
}

/** "Provisionner Fleetbase": the retry path when approval's attempt failed. */
export async function provisionTenant(
  tenantId: string,
): Promise<ProvisionResult> {
  await requireRole("super_admin");
  const result = await provisionTenantFleetbase(tenantId);
  // Nothing follows a successful provision any more: drivers used to be filed
  // into the freshly-created company here, and there is no such filing left.
  if (result?.ok) revalidatePath(`/admin/tenants/${tenantId}`);
  return result;
}

/** Approve a pending self-registered tenant (super-admin only). */
export async function approveTenant(formData: FormData) {
  await requireRole("super_admin");
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = createAdminClient();

  // No Fleetbase company is created any more. Nothing reads that side, and
  // Fleetbase refuses to delete a company by API — every approval was minting
  // a permanent, unusable record.
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
  // Say which of the two happened: the admin needs to know when the account is
  // live but its Fleetbase side still has to be retried.
  redirect(`/admin/tenants/${id}?done=approved`);
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
  const newKey = String(formData.get("apiKey") ?? "").trim();

  // `fleetbase_adhoc_distance` is deliberately NOT written here — the admin form
  // no longer exposes it, and touching it would wipe the values set by hand for
  // testing. See the note on the payload line in @/lib/fleetbase.
  const { error } = await supabase
    .from("tenants")
    .update({
      fleetbase_api_url: apiUrl,
      fleetbase_order_type: orderType,
    })
    .eq("id", id);
  if (error) redirect(`/admin/tenants/${id}?error=save`);

  if (newKey) {
    await supabase.from("tenant_secrets").upsert({
      tenant_id: id,
      fleetbase_api_key_encrypted: encryptSecret(newKey),
      updated_at: new Date().toISOString(),
    });

    // First moment the company is reachable: a freshly created Fleetbase
    // company has no adhoc option at all, which means its drivers see nothing
    // beyond 6 km of a pickup. Align it with the zone now rather than waiting
    // for the owner to happen to edit their zone.
    const { data: t } = await supabase
      .from("tenants")
      .select("zone")
      .eq("id", id)
      .maybeSingle();
    const radiusKm = (t?.zone as { radiusKm?: number } | null)?.radiusKm;
    if (typeof radiusKm === "number")
      await syncCompanyAdhocDistance(id, radiusKm);
  }

  revalidatePath(`/admin/tenants/${id}`);
  redirect(`/admin/tenants/${id}?done=fleetbase`);
}

/** How a connection test ended. A code rather than a sentence: a server action
 *  has no locale, so the client owns the wording. */
export type TestCode = "connected" | "no-key" | "fleetbase-error" | "failed";

export type TestResult = {
  ok: boolean;
  code: TestCode;
  /** Upstream diagnostics for "fleetbase-error"; shown verbatim, never translated. */
  detail?: { status: number; message: string };
} | null;

/** "Test connection": validate a tenant's stored Fleetbase credentials. */
export async function testTenantConnection(
  tenantId: string,
): Promise<TestResult> {
  await requireRole("super_admin");
  const supabase = createAdminClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("slug")
    .eq("id", tenantId)
    .maybeSingle();

  const ctx = tenant?.slug
    ? ((await getTenantFleetbaseContext(tenant.slug as string)) ??
      envFleetbaseContext())
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
