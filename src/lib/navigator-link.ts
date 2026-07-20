// ============================================================
// Navigator connection link — SERVER ONLY.
//
// Before phone login works, the Navigator app must be pointed at our
// self-hosted Fleetbase instance. The app ships a deep link for exactly
// this (InstanceLinkHandler in fleetbase/navigator-app):
//
//   flbnavigator://configure?key=…&host=…&socketcluster_host=…
//
// One tap persists host/key/socket settings and reboots the app — no
// typing. We wrap that deep link in a per-tenant public page
// (/connect/<token>) that the owner shares with drivers.
//
// The token is random, not the slug: the deep link necessarily carries the
// tenant's Fleetbase API key (Navigator's own design — the store build
// ships keyless and receives one at link time), so the page URL must not
// be derivable from anything public.
// ============================================================

import "server-only";
import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteOrigin } from "@/lib/site-url";
import type { FleetbaseContext } from "@/lib/fleetbase";

// The store pages both list the app under its full vendor name; our own copy
// only ever says "Navigator".
export const NAVIGATOR_PLAY_URL =
  "https://play.google.com/store/apps/details?id=io.fleetbase.navigator";
export const NAVIGATOR_APP_STORE_URL =
  "https://apps.apple.com/app/fleetbase-navigator/id1554208255";

/** Android package of the published Navigator app, used by the intent: URI. */
const NAVIGATOR_ANDROID_PACKAGE = "io.fleetbase.navigator";

/**
 * The tenant's connect-page token, minted on first use. Returns null only
 * on a storage failure — every tenant can have a token.
 */
export async function getOrCreateNavigatorToken(
  tenantId: string,
): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("tenants")
    .select("navigator_link_token")
    .eq("id", tenantId)
    .maybeSingle();
  if (!data) return null;
  if (data.navigator_link_token) return data.navigator_link_token as string;

  // Guarded by `is null` so two concurrent mints can't clobber each other:
  // the loser updates zero rows and re-reads the winner's token.
  const token = randomBytes(18).toString("base64url");
  const { data: updated } = await supabase
    .from("tenants")
    .update({ navigator_link_token: token })
    .eq("id", tenantId)
    .is("navigator_link_token", null)
    .select("navigator_link_token")
    .maybeSingle();
  if (updated?.navigator_link_token) return updated.navigator_link_token as string;

  const { data: winner } = await supabase
    .from("tenants")
    .select("navigator_link_token")
    .eq("id", tenantId)
    .maybeSingle();
  return (winner?.navigator_link_token as string | null) ?? null;
}

/**
 * Absolute /connect/<token> URL for a tenant, or null when the token can't
 * be minted. What owners share and what the approval email links to.
 */
export async function navigatorConnectUrl(tenantId: string): Promise<string | null> {
  const token = await getOrCreateNavigatorToken(tenantId);
  if (!token) return null;
  return `${await siteOrigin()}/connect/${token}`;
}

/** The tenant a connect token belongs to, or null for an unknown token. */
export async function getTenantByNavigatorToken(
  token: string,
): Promise<{ id: string; slug: string; name: string } | null> {
  if (!token) return null;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("tenants")
    .select("id, slug, name")
    .eq("navigator_link_token", token)
    .eq("is_active", true)
    .maybeSingle();
  return (data as { id: string; slug: string; name: string } | null) ?? null;
}

export type NavigatorDeepLinks = {
  /** flbnavigator:// — understood by iOS, and by Android once the app exists. */
  ios: string;
  /** intent:// — Android-only form that names the package explicitly. */
  android: string;
};

/**
 * The configure deep links for a tenant's Fleetbase context.
 *
 * The socket settings mirror what Fleetbase's own link-app endpoint sends:
 * same hostname as the API, port/secure from env. Defaults suit our
 * instance — plain HTTP on 91.134.240.158, SocketCluster on :8000 — and
 * FLEETBASE_SOCKET_PORT / FLEETBASE_SOCKET_SECURE override them if the
 * instance ever moves behind TLS. (The socket *path* is not configurable
 * via the deep link; Navigator's default /socketcluster/ applies.)
 */
export function buildNavigatorDeepLinks(ctx: FleetbaseContext): NavigatorDeepLinks {
  const host = ctx.apiUrl.replace(/\/+$/, "");
  const socketHost = new URL(host).hostname;
  const socketPort = (process.env.FLEETBASE_SOCKET_PORT ?? "8000").trim();
  const socketSecure =
    (process.env.FLEETBASE_SOCKET_SECURE ?? "false").toLowerCase() === "true";

  const params = new URLSearchParams({
    key: ctx.apiKey,
    host,
    socketcluster_host: socketHost,
    socketcluster_port: socketPort,
    socketcluster_secure: String(socketSecure),
  });

  return {
    ios: `flbnavigator://configure?${params}`,
    android: `intent://configure?${params}#Intent;scheme=flbnavigator;package=${NAVIGATOR_ANDROID_PACKAGE};end`,
  };
}
