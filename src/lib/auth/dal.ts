// ============================================================
// Data Access Layer — SERVER ONLY. The real auth/authorization boundary.
//
// The Proxy does optimistic redirects; THIS is where access is actually
// enforced. Call require* at the top of every protected page, Server Action,
// and dashboard route handler. Results are memoized per render via React cache.
// ============================================================

import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_LOCALE, hasLocale, type Locale } from "@/i18n/locales";

export type UserRole = "super_admin" | "tenant_admin";

/** Per-member approval state. A tenant's owner is 'active' from signup; a
 *  sub-driver starts 'pending' until a super-admin approves them. */
export type ProfileStatus = "pending" | "active" | "suspended";

export type Profile = {
  id: string;
  tenantId: string | null;
  role: UserRole;
  name: string | null;
  status: ProfileStatus;
  /** null → this is the tenant's owner; set → a sub-driver on their team. */
  parentProfileId: string | null;
  isOwner: boolean;
  /**
   * The language this person reads the dashboard in. Unlike the public pages,
   * which carry their locale in the URL because a shop link gets shared, a
   * dashboard is nobody's shared link — the preference belongs to the person.
   */
  locale: Locale;
};

/** The authenticated Supabase user, or null. Verified against the auth server. */
export const getSessionUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * The current user's profile (role + tenant + team position), or null.
 * RLS-scoped read via profiles_select_self, which is keyed on auth.uid() alone
 * — so this keeps working for a pending sub-driver, whose current_tenant_id()
 * is null and who therefore cannot read any tenant-scoped table.
 */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const user = await getSessionUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, tenant_id, role, name, status, parent_profile_id, locale")
    .eq("id", user.id)
    .maybeSingle();

  if (!data) return null;
  const parentProfileId = (data.parent_profile_id as string | null) ?? null;
  const locale = data.locale as string | null;
  return {
    id: data.id as string,
    tenantId: (data.tenant_id as string | null) ?? null,
    role: data.role as UserRole,
    name: (data.name as string | null) ?? null,
    status: data.status as ProfileStatus,
    parentProfileId,
    isOwner: parentProfileId === null,
    // A check constraint keeps the column to LOCALES, but this narrows a
    // `string` from the wire rather than asserting one.
    locale: hasLocale(locale) ? locale : DEFAULT_LOCALE,
  };
});

/** Require any authenticated user; redirect to /login otherwise. */
export async function requireUser(): Promise<User> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Require a specific role. A super_admin passes any check; a tenant_admin
 * passes only tenant_admin checks. Redirects to /login on failure.
 */
export async function requireRole(role: UserRole): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.role !== role && profile.role !== "super_admin") redirect("/login");
  return profile;
}

/** Require a tenant-scoped user (tenant_admin with a tenant_id). */
export async function requireTenant(): Promise<Profile & { tenantId: string }> {
  const profile = await getProfile();
  if (!profile || !profile.tenantId) redirect("/login");
  return { ...profile, tenantId: profile.tenantId };
}

/**
 * Require the tenant's OWNER — not a sub-driver on their team. Guards the
 * surfaces the boss alone gets: team management, réglages, revenue stats.
 *
 * Use this, never requireRole("tenant_admin"): sub-drivers deliberately carry
 * role='tenant_admin' too (team position is parent_profile_id, not the role),
 * so a role check would let them through. Redirects to /dashboard rather than
 * /login — a sub-driver here is signed in, just not allowed.
 */
export async function requireOwner(): Promise<Profile & { tenantId: string }> {
  const profile = await requireTenant();
  if (!profile.isOwner) redirect("/dashboard");
  return profile;
}
