// ============================================================
// Tenant Data Access Layer — SERVER ONLY.
//
// Resolves a tenant's PUBLIC config (branding/zone/fee/hours) for
// the ordering page, and its SECRET Fleetbase context (decrypted company key)
// for order creation. Uses the service-role client so it works for the
// anonymous public page; never returns secrets to the client.
//
// Graceful migration: until a tenant exists in the database, callers fall
// back to DEFAULT_TENANT_CONFIG (public) and the env Fleetbase key (secret),
// so the app behaves exactly as it did single-tenant.
// ============================================================

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/crypto";
import { DEFAULT_TENANT_CONFIG } from "@/lib/default-config";
import {
  defaultFleetbaseApiUrl,
  envFleetbaseContext,
  type FleetbaseContext,
} from "@/lib/fleetbase";
import {
  adhocDistanceForZone,
  getCompanyIdForKey,
  isFleetbaseAdminConfigured,
  setCompanyAdhocDistance,
} from "@/lib/fleetbase-admin";
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
  fleetbase_api_url: string | null;
  fleetbase_order_type: string | null;
  fleetbase_dispatch: boolean;
  fleetbase_adhoc: boolean;
  fleetbase_adhoc_distance: number | null;
  is_active: boolean;
};

async function fetchTenantRow(slug: string): Promise<TenantRow | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("tenants")
    .select(
      "id, slug, name, branding, zone, fee_config, hours, phone_country, fleetbase_api_url, fleetbase_order_type, fleetbase_dispatch, fleetbase_adhoc, fleetbase_adhoc_distance, is_active",
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
 * The Fleetbase context for a tenant (decrypted company key). Returns null
 * when the tenant has no stored key. Server-only — never expose the result.
 */
export async function getTenantFleetbaseContext(
  slug: string,
): Promise<FleetbaseContext | null> {
  if (!isSupabaseConfigured()) return null;
  const row = await fetchTenantRow(slug);
  if (!row) return null;

  const supabase = createAdminClient();
  const { data: secret, error } = await supabase
    .from("tenant_secrets")
    .select("fleetbase_api_key_encrypted")
    .eq("tenant_id", row.id)
    .maybeSingle();

  if (error || !secret?.fleetbase_api_key_encrypted) return null;

  let apiKey: string;
  try {
    apiKey = decryptSecret(secret.fleetbase_api_key_encrypted as string);
  } catch (err) {
    console.error("[tenant] key decrypt failed:", (err as Error).message);
    return null;
  }

  return {
    apiUrl: row.fleetbase_api_url ?? defaultFleetbaseApiUrl(),
    apiKey,
    orderType: row.fleetbase_order_type ?? undefined,
    dispatch: row.fleetbase_dispatch,
    adhoc: row.fleetbase_adhoc,
    adhocDistance: row.fleetbase_adhoc_distance ?? undefined,
  };
}

/**
 * Align the tenant's Fleetbase company with a delivery-zone radius, so its
 * drivers actually see the orders inside that zone.
 *
 * Best-effort by design, and every early return is a legitimate state: no
 * stored key yet (the company is provisioned by hand, after signup), no admin
 * credentials configured (see fleetbase-admin.ts — the public API cannot write
 * this), or Fleetbase being unreachable. None of those should fail whatever
 * operation asked for the sync; the zone is the source of truth either way and
 * the next save retries.
 *
 * Returns the radius now in force, or null when nothing was written.
 */
export async function syncCompanyAdhocDistance(
  tenantId: string,
  radiusKm: number,
): Promise<number | null> {
  if (!isSupabaseConfigured() || !isFleetbaseAdminConfigured()) return null;

  try {
    const supabase = createAdminClient();
    const { data: row } = await supabase
      .from("tenants")
      .select("fleetbase_api_url")
      .eq("id", tenantId)
      .maybeSingle();
    const { data: secret } = await supabase
      .from("tenant_secrets")
      .select("fleetbase_api_key_encrypted")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (!secret?.fleetbase_api_key_encrypted) return null;

    const apiUrl =
      (row?.fleetbase_api_url as string | null) ?? defaultFleetbaseApiUrl();
    const apiKey = decryptSecret(secret.fleetbase_api_key_encrypted as string);

    // The tenant→company mapping lives in the key itself, not in our schema.
    const companyId = await getCompanyIdForKey(apiKey, apiUrl);
    if (!companyId) return null;

    return await setCompanyAdhocDistance(
      companyId,
      adhocDistanceForZone(radiusKm),
      apiUrl,
    );
  } catch (err) {
    console.error(
      "[tenant] adhoc distance sync failed:",
      (err as Error).message,
    );
    return null;
  }
}

/**
 * Resolve a Fleetbase context for a request: the tenant's stored company key
 * when a slug resolves to a configured tenant, otherwise the legacy env key.
 * Returns null when neither is available (caller should 503).
 */
export async function resolveFleetbaseContext(
  slug?: string | null,
): Promise<FleetbaseContext | null> {
  if (slug) {
    const ctx = await getTenantFleetbaseContext(slug);
    if (ctx) return ctx;
  }
  return envFleetbaseContext();
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
