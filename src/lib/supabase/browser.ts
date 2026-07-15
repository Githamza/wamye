// ============================================================
// Supabase browser client — for use in Client Components (the dashboard).
// Uses the public anon key + RLS; never has elevated privileges.
// ============================================================

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
