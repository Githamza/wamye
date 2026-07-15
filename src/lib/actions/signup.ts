"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/slug";

/**
 * Public self-registration for a driver (no auth required). Creates a PENDING
 * tenant + its tenant_admin login. A super-admin then approves the tenant and
 * connects its Fleetbase before the driver can use the dashboard — until then
 * the dashboard redirects them to /pending.
 *
 * NOTE: this is an unauthenticated write endpoint; add rate-limiting/captcha
 * before opening signup publicly (tracked as a prod-readiness follow-up).
 */
export async function signupDriver(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const supportPhone = String(formData.get("supportPhone") ?? "").trim();
  const areaLabel = String(formData.get("areaLabel") ?? "").trim();

  if (!name || !email || password.length < 8) {
    redirect("/signup?error=missing");
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

  // 3. Link the login to its tenant as a tenant_admin (the "driver").
  await supabase.from("profiles").upsert({
    id: created.user.id,
    tenant_id: tenant.id,
    role: "tenant_admin",
    name,
  });

  // 4. Sign the new driver in (sets session cookies) so they land on /pending.
  const session = await createClient();
  await session.auth.signInWithPassword({ email, password });

  redirect("/pending?new=1");
}
