import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Rate limiting, in Postgres.
 *
 * An in-memory Map will not do: `output: "standalone"` can run behind several
 * containers and route-handler module state is not shared between them, so a
 * limit that lives in one process is a limit an attacker rotates around.
 *
 * Fails OPEN. If the limiter itself is broken, refusing every customer's order
 * would be a far more expensive failure than letting a burst through.
 */
export async function allow(
  key: string,
  limit: number,
  window: string,
): Promise<boolean> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("hit_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window: window,
    });
    if (error) {
      console.error("[rate-limit] check failed:", error.message);
      return true;
    }
    return data !== false;
  } catch (err) {
    console.error("[rate-limit] check threw:", (err as Error).message);
    return true;
  }
}

/** Best-effort client IP from the proxy headers Coolify/Traefik set. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
