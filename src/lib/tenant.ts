// ============================================================
// Tenant Data Access Layer — SERVER ONLY.
//
// Resolves a tenant's public config (branding/zone/fee/hours) for the ordering
// page. Uses the service-role client so it works for the anonymous public page.
//
// There is no secret half any more: this file used to also hand out a decrypted
// Fleetbase company key, back when creating an order meant calling out to
// Fleetbase. Orders live in Supabase now, and so does dispatch, so nothing here
// reaches outside the database.
//
// Graceful migration: until a tenant exists in the database, callers fall back
// to DEFAULT_TENANT_CONFIG, so the app behaves exactly as it did single-tenant.
// ============================================================

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_TENANT_CONFIG } from "@/lib/default-config";
import type { TenantPublicConfig } from "@/lib/config-types";

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

type TenantRow = {
  id: string;
  slug: string;
  name: string;
  branding: TenantPublicConfig["branding"] | null;
  zone: TenantPublicConfig["zone"];
  fee_config: TenantPublicConfig["feeConfig"];
  hours: TenantPublicConfig["hours"];
  phone_country: string | null;
  is_active: boolean;
};

async function fetchTenantRow(slug: string): Promise<TenantRow | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("tenants")
    .select(
      "id, slug, name, branding, zone, fee_config, hours, phone_country, is_active",
    )
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("[tenant] fetch failed:", error.message);
    return null;
  }
  return (data as TenantRow) ?? null;
}

/** One entry in the landing page's directory of tenants. */
export type TenantSummary = {
  slug: string;
  name: string;
  branding: TenantPublicConfig["branding"];
  hours: TenantPublicConfig["hours"];
};

/**
 * Every tenant a customer can order from, for the public directory on the
 * landing page. Service-role read because `tenants_select` is closed to
 * anonymous visitors; only non-secret display fields are selected.
 *
 * `status` and `is_active` are both required: a self-registered tenant is
 * pending until a super-admin approves it, and must not be listed meanwhile.
 */
export async function listPublicTenants(): Promise<TenantSummary[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("tenants")
    .select("slug, name, branding, hours")
    .eq("is_active", true)
    .eq("status", "active")
    .order("name");

  if (error) {
    console.error("[tenant] directory fetch failed:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    slug: row.slug as string,
    name: row.name as string,
    branding: (row.branding as TenantPublicConfig["branding"] | null) ?? {
      name: row.name as string,
    },
    hours: row.hours as TenantPublicConfig["hours"],
  }));
}

/** The public ordering-page config for a tenant, or null if not found. */
export async function getTenantPublicConfig(
  slug: string,
): Promise<TenantPublicConfig | null> {
  if (!isSupabaseConfigured()) return null;
  const row = await fetchTenantRow(slug);
  if (!row) return null;

  return {
    slug: row.slug,
    branding: row.branding ?? { name: row.name },
    zone: row.zone,
    feeConfig: row.fee_config,
    hours: row.hours,
    phoneCountry: row.phone_country ?? "TN",
  };
}

/**
 * Resolve public config for a request: the tenant's stored config when the
 * slug resolves, otherwise the built-in default (legacy single-tenant).
 */
export async function resolvePublicConfig(
  slug?: string | null,
): Promise<TenantPublicConfig> {
  if (slug) {
    const cfg = await getTenantPublicConfig(slug);
    if (cfg) return cfg;
  }
  return DEFAULT_TENANT_CONFIG;
}

/**
 * Public config for a tenant PAGE. Unlike resolvePublicConfig (which always
 * yields a usable config for API routes), this returns null for an unknown
 * slug once a database is configured, so the page can render a 404. Before any
 * DB is configured, only the built-in default slug resolves (legacy mode).
 */
export async function getPageConfig(
  slug: string,
): Promise<TenantPublicConfig | null> {
  const cfg = await getTenantPublicConfig(slug);
  if (cfg) return cfg;
  if (!isSupabaseConfigured() && slug === DEFAULT_TENANT_CONFIG.slug) {
    return DEFAULT_TENANT_CONFIG;
  }
  return null;
}

/**
 * The tenant an incoming order claims to belong to — resolved and *validated*.
 *
 * POST /api/orders is necessarily public (the customer is anonymous), and the
 * slug therefore comes from the browser. That is not itself the problem: the
 * customer legitimately picks the shop by opening /t/[slug]. The problem was
 * that nothing checked it, so an order could be filed against a tenant still
 * awaiting approval. Both flags are required, exactly like listPublicTenants.
 */
export type OrderTenant = {
  id: string;
  slug: string;
  zone: TenantPublicConfig["zone"];
  feeConfig: TenantPublicConfig["feeConfig"];
};

export async function getTenantForOrder(
  slug: string,
): Promise<OrderTenant | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("tenants")
    .select("id, slug, zone, fee_config")
    .eq("slug", slug)
    .eq("is_active", true)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    console.error("[tenant] order-tenant fetch failed:", error.message);
    return null;
  }
  if (!data) return null;

  return {
    id: data.id as string,
    slug: data.slug as string,
    zone: data.zone as TenantPublicConfig["zone"],
    feeConfig: data.fee_config as TenantPublicConfig["feeConfig"],
  };
}

/** The tenant's uuid for a slug, or null. */
export async function getTenantIdBySlug(slug: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const row = await fetchTenantRow(slug);
  return row?.id ?? null;
}

// Order persistence moved to @/lib/orders (createOrderRecord): Supabase is the
// source of truth now, so writing the order is no longer a best-effort mirror
// this module can own on the side.
