import "server-only";
import { headers } from "next/headers";

/**
 * Origin for absolute URLs handed out of the app (emails, share links).
 * SITE_URL when configured, so links always carry the canonical public
 * domain no matter which of the app's hosts (custom domain, sslip.io
 * fallback) served the request; otherwise the origin of the current
 * request (proxy-aware) — dev has no SITE_URL.
 */
export async function siteOrigin(): Promise<string> {
  const configured = process.env.SITE_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}
