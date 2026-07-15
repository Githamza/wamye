// ============================================================
// Supabase service-role client — SERVER ONLY. Bypasses RLS.
//
// Use only where the request must act outside a single tenant's RLS
// scope: reading tenant_secrets (the encrypted Fleetbase key), writing
// the orders mirror from the anonymous public ordering page, and
// super-admin tenant provisioning. Never import from a client component.
// ============================================================

import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
