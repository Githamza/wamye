// ============================================================
// Fleetbase console admin client — SERVER ONLY.
//
// Exists for exactly one thing the public API cannot do: write a company's
// `options.fleetops.adhoc_distance`.
//
// Why that option matters. Navigator's "orders near me" list is
// GET /v1/orders?nearby=driver_…&adhoc=1&unassigned=1&dispatched=1, and
// fleetops' Api/v1/OrderController computes its search radius ONCE, from the
// caller company's option, then applies it to every order:
//
//     $distance = 6000;                                    // default, in meters
//     if ($company) { $distance = $company->getOption('fleetops.adhoc_distance', 6000); }
//
// The order's own `adhoc_distance` column is never read there — it only governs
// the dispatch-time push (HandleOrderDispatched → Order::getAdhocDistance()).
// So a company left at the 6 km default hides every order from any driver
// further than 6 km from the pickup, silently, no matter what the order says.
//
// The public API exposes this option read-only (GET /v1/organizations/current).
// Writing it needs a console session: /int/v1 rejects flb_live_* keys outright.
// /int/v1 is Fleetbase's UNDOCUMENTED internal API — verified by round-trip
// against v0.7.51; re-verify after upgrading the instance.
// ============================================================

import "server-only";
import { defaultFleetbaseApiUrl } from "@/lib/fleetbase";

/** True when admin credentials are configured — callers degrade silently otherwise. */
export function isFleetbaseAdminConfigured(): boolean {
  return (
    (process.env.FLEETBASE_ADMIN_EMAIL ?? "").trim() !== "" &&
    (process.env.FLEETBASE_ADMIN_PASSWORD ?? "").trim() !== ""
  );
}

/**
 * The radius a company needs so that any driver inside the delivery zone can
 * see any pickup inside it.
 *
 * Note this is TWICE the zone radius, not the radius itself: the measurement
 * runs driver→pickup, and two points in a circle of radius R can be 2R apart —
 * a driver on the north edge, a pickup on the south. Using R alone would leave
 * drivers blind to the far half of their own zone.
 *
 * Floored at Fleetbase's 6 km default so this can never narrow what a company
 * already sees, and capped to keep a mis-typed zone from broadcasting nationally.
 */
export function adhocDistanceForZone(radiusKm: number): number {
  const meters = Math.round(radiusKm * 2 * 1000);
  return Math.min(500_000, Math.max(6_000, meters));
}

type Company = { public_id?: string; options?: Record<string, unknown> };

/** Cached across calls in the same server process: logging in per write would
 *  mint a personal access token on every settings save. */
let cachedToken: string | null = null;

/**
 * Serialises every admin write in this process.
 *
 * Writing a company means switching the admin session onto it first, and
 * `AuthController::switchOrganization` does that by mutating the USER row
 * (`$user->assignCompanyFromId()`), not the token. So two concurrent syncs
 * would interleave — switch A, switch B, then A writes its radius onto B's
 * company. Chaining the operations removes that window within the process;
 * the post-write assertion below is what catches it across processes.
 */
let queue: Promise<unknown> = Promise.resolve();
function serialize<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => {});
  return run;
}

async function login(apiUrl: string): Promise<string> {
  if (cachedToken) return cachedToken;

  // The field is `identity` (email OR phone), not `email` — see core-api
  // Internal/v1/AuthController::login.
  const res = await fetch(`${apiUrl}/int/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      identity: (process.env.FLEETBASE_ADMIN_EMAIL ?? "").trim(),
      password: process.env.FLEETBASE_ADMIN_PASSWORD ?? "",
    }),
  });

  if (!res.ok) throw new Error(`admin login failed (${res.status})`);
  const body = (await res.json()) as { token?: string };
  if (!body.token) throw new Error("admin login returned no token");

  cachedToken = body.token;
  return cachedToken;
}

/**
 * Point the company's adhoc radius at `meters`.
 *
 * Reads the current options and merges, rather than replacing: `options` is a
 * single JSON blob shared with every other Fleetbase extension, and a blind PUT
 * would drop whatever else lives in it.
 *
 * Returns the value now in force, or null when admin credentials are absent.
 * Throws only on a genuine upstream failure, so callers can decide whether the
 * surrounding operation should fail with it.
 *
 * Side effect worth knowing: this leaves the admin account sitting on the
 * company it last wrote, because switching organizations rewrites the user's
 * own `company_uuid`. Use a dedicated admin account, not a human's — otherwise
 * their console lands somewhere unexpected on next sign-in.
 */
export async function setCompanyAdhocDistance(
  companyId: string,
  meters: number,
  apiUrl: string = defaultFleetbaseApiUrl(),
): Promise<number | null> {
  if (!isFleetbaseAdminConfigured()) return null;

  return serialize(async () => {
    const token = await login(apiUrl);
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    // CompanyController::resolveVisibleCompany only ever resolves the SESSION
    // company — an admin flag buys nothing on this route. So the session has to
    // be moved onto the target first, or every read and write 404s.
    const orgsRes = await fetch(`${apiUrl}/int/v1/auth/organizations`, { headers });
    if (!orgsRes.ok) throw new Error(`organizations read failed (${orgsRes.status})`);
    const orgs = (await orgsRes.json()) as Array<{ uuid?: string; public_id?: string }>;
    const target = orgs.find((o) => o.public_id === companyId);
    if (!target?.uuid) throw new Error(`admin does not belong to ${companyId}`);

    const swap = await fetch(`${apiUrl}/int/v1/auth/switch-organization`, {
      method: "POST",
      headers,
      body: JSON.stringify({ next: target.uuid }),
    });
    // Already-on-this-org comes back 200 with an `errors` array, which is fine.
    if (!swap.ok) throw new Error(`organization switch failed (${swap.status})`);

    const found = await fetch(`${apiUrl}/int/v1/companies/${companyId}`, { headers });
    if (!found.ok) throw new Error(`company read failed (${found.status})`);

    // Internal responses are wrapped under the singular resource name.
    const payload = (await found.json()) as { company?: Company } & Company;
    const company = payload.company ?? payload;
    const options = company.options ?? {};
    const fleetops = (options.fleetops ?? {}) as Record<string, unknown>;

    const res = await fetch(`${apiUrl}/int/v1/companies/${companyId}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        company: { options: { ...options, fleetops: { ...fleetops, adhoc_distance: meters } } },
      }),
    });
    if (!res.ok) throw new Error(`company update failed (${res.status})`);

    // Assert we wrote what we meant, onto whom we meant. This is the backstop
    // for a session hijacked by a concurrent write from another process: a
    // mismatch here means the radius landed on the wrong company.
    const after = (await res.json()) as { company?: Company } & Company;
    const wrote = after.company ?? after;
    const got = (wrote.options?.fleetops as { adhoc_distance?: number } | undefined)
      ?.adhoc_distance;
    if (wrote.public_id !== companyId || got !== meters) {
      throw new Error(
        `adhoc write landed wrong: expected ${companyId}=${meters}, got ${wrote.public_id}=${got}`,
      );
    }

    // Put the account back where it was. Only matters when the credentials
    // belong to a human who also signs into the console — without this, every
    // zone save silently moves their active organization.
    const home = (process.env.FLEETBASE_ADMIN_HOME_COMPANY ?? "").trim();
    if (home && home !== companyId) {
      const homeUuid = orgs.find((o) => o.public_id === home)?.uuid;
      if (homeUuid) {
        await fetch(`${apiUrl}/int/v1/auth/switch-organization`, {
          method: "POST",
          headers,
          body: JSON.stringify({ next: homeUuid }),
        }).catch(() => {
          // Best-effort: the radius is already written and verified, and a
          // failed restore is cosmetic. Never fail the sync over it.
        });
      }
    }

    return meters;
  });
}

/**
 * The Fleetbase company a tenant's API key belongs to. Read with the tenant's
 * own key — the mapping is implicit in the key itself, and is not stored
 * anywhere on our side (tenants.fleetbase_company_id is null for every tenant).
 */
export async function getCompanyIdForKey(
  apiKey: string,
  apiUrl: string = defaultFleetbaseApiUrl(),
): Promise<string | null> {
  const res = await fetch(`${apiUrl}/v1/organizations/current`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { id?: string };
  return body.id ?? null;
}

/** The radius currently in force for a key's company, or null if unreadable. */
export async function getCompanyAdhocDistance(
  apiKey: string,
  apiUrl: string = defaultFleetbaseApiUrl(),
): Promise<number | null> {
  const res = await fetch(`${apiUrl}/v1/organizations/current`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as {
    options?: { fleetops?: { adhoc_distance?: number } };
  };
  return body.options?.fleetops?.adhoc_distance ?? null;
}
