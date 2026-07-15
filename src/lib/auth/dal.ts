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

export type UserRole = "super_admin" | "tenant_admin";

export type Profile = {
  id: string;
  tenantId: string | null;
  role: UserRole;
  name: string | null;
};

/** The authenticated Supabase user, or null. Verified against the auth server. */
export const getSessionUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/** The current user's profile (role + tenant), or null. RLS-scoped read. */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const user = await getSessionUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, tenant_id, role, name")
    .eq("id", user.id)
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id as string,
    tenantId: (data.tenant_id as string | null) ?? null,
    role: data.role as UserRole,
    name: (data.name as string | null) ?? null,
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
