// ============================================================
// Tenant Data Access Layer — SERVER ONLY.
//
// Resolves a tenant's PUBLIC config (branding/zone/fee/hours/commerces) for
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
  envFleetbaseContext,
  type FleetbaseContext,
} from "@/lib/fleetbase";
import type { Commerce, TenantPublicConfig } from "@/lib/config-types";
import type { CreateOrderInput, CreatedOrder } from "@/lib/order-types";

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
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

async function fetchCommerces(tenantId: string): Promise<Commerce[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("commerces")
    .select("id, name, addr, lat, lng")
    .eq("tenant_id", tenantId)
    .eq("active", true);

  if (error || !data) return [];
  return data.map((c) => ({
    id: String(c.id),
    name: c.name as string,
    addr: c.addr as string,
    lat: (c.lat as number | null) ?? undefined,
    lng: (c.lng as number | null) ?? undefined,
  }));
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
    branding:
      (row.branding as TenantPublicConfig["branding"] | null) ?? {
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
    commerces: await fetchCommerces(row.id),
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
    apiUrl: row.fleetbase_api_url ?? "http://91.134.240.158",
    apiKey,
    orderType: row.fleetbase_order_type ?? undefined,
    dispatch: row.fleetbase_dispatch,
    adhoc: row.fleetbase_adhoc,
    adhocDistance: row.fleetbase_adhoc_distance ?? undefined,
  };
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

/** The tenant's uuid for a slug, or null. */
export async function getTenantIdBySlug(slug: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const row = await fetchTenantRow(slug);
  return row?.id ?? null;
}

/**
 * Best-effort: mirror a created order into the dashboard `orders` table and
 * upsert the customer into `clients`. Never throws — a mirror failure must
 * not fail the customer's order (Fleetbase is the source of truth).
 */
export async function recordOrderMirror(
  tenantId: string,
  input: CreateOrderInput,
  created: CreatedOrder,
): Promise<void> {
  try {
    const supabase = createAdminClient();

    let clientId: string | null = null;
    // Only set name/landmark when provided, so a later order without a prénom
    // doesn't wipe a returning customer's saved name (omitted columns are
    // preserved by ON CONFLICT DO UPDATE).
    const clientRow: Record<string, unknown> = {
      tenant_id: tenantId,
      phone: input.phone,
    };
    if (input.prenom?.trim()) clientRow.name = input.prenom.trim();
    if (input.repere?.trim()) clientRow.last_repere = input.repere.trim();
    const { data: client } = await supabase
      .from("clients")
      .upsert(clientRow, { onConflict: "tenant_id,phone" })
      .select("id")
      .maybeSingle();
    clientId = (client?.id as string) ?? null;

    await supabase.from("orders").insert({
      tenant_id: tenantId,
      fleetbase_id: created.id,
      tracking_number: created.trackingNumber,
      status: created.status,
      stage: created.stage,
      client_id: clientId,
      phone: input.phone,
      commerce_name: input.commerceName,
      order_text: input.order,
      fee: input.fee,
      distance_km: input.distanceKm,
      quote_source: input.quoteSource ?? "estimate",
      position: input.position,
    });
  } catch (err) {
    console.error("[tenant] order mirror failed:", (err as Error).message);
  }
}
