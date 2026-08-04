"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/slug";
import { isValidPhone, normalizePhone } from "@/lib/phone";
import { sendSignupReceivedEmail } from "@/lib/auth/approval-email";

/**
 * Public self-registration for a driver (no auth required). Creates a PENDING
 * tenant + its tenant_admin login. A super-admin then approves the tenant
 * before the driver can use the dashboard — until then the dashboard
 * redirects them to /pending.
 *
 * This is the path for someone starting their OWN business. A driver joining
 * an existing team comes through /rejoindre instead (src/lib/actions/join.ts).
 *
 * NOTE: this is an unauthenticated write endpoint; add rate-limiting/captcha
 * before opening signup publicly (tracked as a prod-readiness follow-up).
 */
export async function signupDriver(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const areaLabel = String(formData.get("areaLabel") ?? "").trim();
  // Accept "@handle", a bare handle, or a full profile URL — keep just the handle.
  const instagram = String(formData.get("instagram") ?? "")
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .replace(/\/.*$/, "");

  if (!name || !email || password.length < 8) {
    redirect("/signup?error=missing");
  }

  // The phone is required, not cosmetic: it is what registers this person as a
  // Fleetbase driver at approval, and a tenant whose owner has no number can be
  // approved but never dispatched to.
  //
  // Validated and STORED as the 8 local digits — normalizePhone also absorbs
  // whatever the browser let through (spaces, a pasted prefix the client-side
  // field missed). Everything downstream that needs E.164 goes through
  // toInternationalPhone, which puts the tenant's dial code back on.
  const supportPhone = normalizePhone(String(formData.get("supportPhone") ?? ""));
  if (!isValidPhone(supportPhone)) {
    redirect("/signup?error=phone");
  }

  const supabase = createAdminClient();

  // Unique slug from the business name (append -2, -3… on collision).
  const base = slugify(name) || "livreur";
  let slug = base;
  for (let i = 2; ; i++) {
    const { data: taken } = await supabase
      .from("tenants")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!taken) break;
    slug = `${base}-${i}`;
  }

  // 1. PENDING tenant with sensible defaults (public page off until approved).
  const { data: tenant, error: tErr } = await supabase
    .from("tenants")
    .insert({
      slug,
      name,
      branding: {
        name,
        logoEmoji: "🛵",
        areaLabel: areaLabel || undefined,
        supportPhone: supportPhone || undefined,
        instagram: instagram || undefined,
      },
      zone: { centerLat: 33.808, centerLng: 10.995, radiusKm: 15 },
      fee_config: { baseFee: 2.5, feePerKm: 0.6, minFee: 3 },
      hours: { openHour: 8, closeHour: 23, alwaysOpen: false },
      phone_country: "TN",
      fleetbase_order_type: "storefront",
      status: "pending",
      is_active: false,
    })
    .select("id")
    .single();
  if (tErr || !tenant) redirect("/signup?error=insert");

  // 2. Auth user with the caller-chosen password (no email verification; the
  //    super-admin approval is the real gate).
  const { data: created, error: uErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (uErr || !created?.user) {
    // Roll back the tenant so a retry with a different email is clean.
    await supabase.from("tenants").delete().eq("id", tenant.id);
    redirect("/signup?error=email");
  }

  // 3. Link the login to its tenant as a tenant_admin (the "driver"). They are
  //    the team's owner: parent_profile_id stays null and status defaults to
  //    'active' — a new driver waits on tenants.status, not their own.
  //    The phone is stored on the profile too, not just in branding: it is what
  //    registers them as a Fleetbase driver, which needs name + email + phone.
  await supabase.from("profiles").upsert({
    id: created.user.id,
    tenant_id: tenant.id,
    role: "tenant_admin",
    name,
    phone: supportPhone || null,
  });

  // 4. Thank-you / "validation under way, 48–72h" acknowledgement. Best-effort:
  //    signup goes through even if the mail doesn't.
  await sendSignupReceivedEmail(email, name);

  // 5. Sign the new driver in (sets session cookies) so they land on /pending.
  const session = await createClient();
  await session.auth.signInWithPassword({ email, password });

  redirect("/pending?new=1");
}
