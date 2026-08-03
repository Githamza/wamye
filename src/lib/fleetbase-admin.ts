// ============================================================
// Fleetbase console admin client — SERVER ONLY.
//
// Exists for the two things the public API cannot do:
//   1. create a company and mint its API key (provisionCompany)
//   2. write a company's `options.fleetops.adhoc_distance`
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

async function login(apiUrl: string, force = false): Promise<string> {
  if (cachedToken && !force) return cachedToken;

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
 * One authenticated call to /int/v1, retried once on 401.
 *
 * The retry is the point: `cachedToken` lives as long as the server process,
 * while Fleetbase personal access tokens do not. Without it, the first token to
 * expire would break every admin write until the next deploy.
 *
 * 403 is deliberately NOT retried — it is a real denial (e.g. "Generic
 * organization deletion is not supported"), not a stale credential.
 */
async function adminFetch(
  apiUrl: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const call = async (token: string) =>
    fetch(`${apiUrl}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });

  const res = await call(await login(apiUrl));
  if (res.status !== 401) return res;

  cachedToken = null;
  return call(await login(apiUrl, true));
}

/** Read the internal API's response, which wraps resources under a singular key. */
async function unwrap<T>(res: Response, key: string, what: string): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { errors?: string[] } | null;
    const detail = body?.errors?.join(", ");
    throw new Error(`${what} failed (${res.status})${detail ? `: ${detail}` : ""}`);
  }
  const body = (await res.json()) as Record<string, unknown>;
  return (body[key] ?? body) as T;
}

/** A freshly provisioned Fleetbase company and the key that talks to it. */
export type ProvisionedCompany = {
  /** `company_…` — what /v1/organizations/current calls `id`. */
  companyId: string;
  /** `flb_live_…`, shown exactly once: store it or lose it. */
  apiKey: string;
};

/**
 * Create a Fleetbase company and mint its API key, in one admin session.
 *
 * Both endpoints are internal-API-only: `flb_live_*` keys are rejected by
 * /int/v1 outright, and there is no public route that creates a company. The
 * company is created UNDER THE ADMIN ACCOUNT (`create-organization` sets
 * owner_uuid to the caller), which is what later lets setCompanyAdhocDistance
 * find it in /int/v1/auth/organizations and switch onto it.
 *
 * Serialised with the adhoc writes for the same reason they are serialised with
 * each other: creating an organization silently switches the admin user's
 * session onto it, and that switch is stored on the USER row, not the token.
 *
 * Verified by round-trip against v0.7.51. Note `create-organization` validates
 * nothing — an empty body yields a nameless company that CANNOT be deleted
 * ("Generic organization deletion is not supported"), so callers must pass a
 * name and must not retry blindly on an ambiguous failure.
 */
export async function provisionCompany(
  name: string,
  opts: {
    description?: string;
    phone?: string;
    country?: string;
    currency?: string;
    timezone?: string;
    apiUrl?: string;
    /** Label shown next to the key in the Fleetbase console. */
    keyName?: string;
  } = {},
): Promise<ProvisionedCompany | null> {
  if (!isFleetbaseAdminConfigured()) return null;

  const trimmed = name.trim();
  if (!trimmed) throw new Error("company name is required");
  const apiUrl = opts.apiUrl ?? defaultFleetbaseApiUrl();

  return serialize(async () => {
    const created = await unwrap<{ uuid?: string; public_id?: string }>(
      await adminFetch(apiUrl, "/int/v1/auth/create-organization", {
        method: "POST",
        body: JSON.stringify({
          name: trimmed,
          description: opts.description,
          phone: opts.phone,
          country: opts.country ?? "TN",
          currency: opts.currency ?? "TND",
          timezone: opts.timezone ?? "Africa/Tunis",
        }),
      }),
      "company",
      "organization create",
    );
    if (!created.uuid || !created.public_id) {
      throw new Error("organization create returned no id");
    }

    // create-organization already leaves the session on the new company, but
    // say so explicitly: the key is minted for whatever company the session is
    // on, and a wrong one here would hand this tenant another tenant's fleet.
    // An "already on this organization" error back is success.
    await adminFetch(apiUrl, "/int/v1/auth/switch-organization", {
      method: "POST",
      body: JSON.stringify({ next: created.uuid }),
    });

    const credential = await unwrap<{ key?: string; company_uuid?: string }>(
      await adminFetch(apiUrl, "/int/v1/api-credentials", {
        method: "POST",
        body: JSON.stringify({ name: opts.keyName ?? "Wamye" }),
      }),
      "api_credential",
      "api key create",
    );

    // The key is only ever returned in full here, so verify before it is the
    // one thing we keep: a key belonging to another company would look fine in
    // every later check and quietly cross-file this tenant's orders.
    if (credential.company_uuid !== created.uuid) {
      throw new Error(
        `api key landed on the wrong company (${credential.company_uuid} ≠ ${created.uuid})`,
      );
    }
    if (!credential.key) throw new Error("api key create returned no key");

    await restoreHomeCompany(apiUrl, created.public_id);
    return { companyId: created.public_id, apiKey: credential.key };
  });
}

/**
 * Put the admin account back on its own company. Best-effort and never fatal:
 * the caller's work is already done and verified by the time this runs — this
 * only spares a human admin from finding their console on a tenant's fleet.
 */
async function restoreHomeCompany(apiUrl: string, current: string): Promise<void> {
  const home = (process.env.FLEETBASE_ADMIN_HOME_COMPANY ?? "").trim();
  if (!home || home === current) return;

  try {
    const res = await adminFetch(apiUrl, "/int/v1/auth/organizations");
    if (!res.ok) return;
    const orgs = (await res.json()) as Array<{ uuid?: string; public_id?: string }>;
    const uuid = orgs.find((o) => o.public_id === home)?.uuid;
    if (!uuid) return;
    await adminFetch(apiUrl, "/int/v1/auth/switch-organization", {
      method: "POST",
      body: JSON.stringify({ next: uuid }),
    });
  } catch {
    // Cosmetic — see above.
  }
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
    // CompanyController::resolveVisibleCompany only ever resolves the SESSION
    // company — an admin flag buys nothing on this route. So the session has to
    // be moved onto the target first, or every read and write 404s.
    const orgsRes = await adminFetch(apiUrl, "/int/v1/auth/organizations");
    if (!orgsRes.ok) throw new Error(`organizations read failed (${orgsRes.status})`);
    const orgs = (await orgsRes.json()) as Array<{ uuid?: string; public_id?: string }>;
    const target = orgs.find((o) => o.public_id === companyId);
    if (!target?.uuid) throw new Error(`admin does not belong to ${companyId}`);

    const swap = await adminFetch(apiUrl, "/int/v1/auth/switch-organization", {
      method: "POST",
      body: JSON.stringify({ next: target.uuid }),
    });
    // Already-on-this-org comes back 200 with an `errors` array, which is fine.
    if (!swap.ok) throw new Error(`organization switch failed (${swap.status})`);

    const found = await adminFetch(apiUrl, `/int/v1/companies/${companyId}`);
    if (!found.ok) throw new Error(`company read failed (${found.status})`);

    // Internal responses are wrapped under the singular resource name.
    const payload = (await found.json()) as { company?: Company } & Company;
    const company = payload.company ?? payload;
    const options = company.options ?? {};
    const fleetops = (options.fleetops ?? {}) as Record<string, unknown>;

    const res = await adminFetch(apiUrl, `/int/v1/companies/${companyId}`, {
      method: "PUT",
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
    await restoreHomeCompany(apiUrl, companyId);

    return meters;
  });
}

/** Which of a person's identifiers are already taken somewhere on the instance. */
export type IdentityConflict = { email: boolean; phone: boolean };

const NO_CONFLICT: IdentityConflict = { email: false, phone: false };

/**
 * Is this email / phone already attached to a Fleetbase user ANYWHERE on the
 * instance?
 *
 * Fleetbase users are unique instance-wide, not per company: a person already
 * registered under one organization cannot be created as a driver under
 * another, and the attempt comes back as a bare 422. Worth catching before the
 * approval rather than after.
 *
 * There is no user-lookup endpoint to ask with — `/int/v1/users` only ever
 * sees the session company, and `/int/v1/users/search` finds nothing at all.
 * What does answer is the ONBOARDING VALIDATOR: a partial body posted to
 * `/int/v1/onboard/create-account` runs the uniqueness rules and returns
 * "An account with this email address already exists" / "…phone number…"
 * among the "field is required" errors — while creating nothing, precisely
 * because the required fields are missing. No authentication needed either.
 *
 * Best-effort by design: any transport or shape surprise reports "no conflict"
 * rather than blocking an approval on a probe that is itself a workaround.
 */
export async function checkIdentityConflict(
  input: { email?: string | null; phone?: string | null },
  apiUrl: string = defaultFleetbaseApiUrl(),
): Promise<IdentityConflict> {
  const email = input.email?.trim();
  const phone = input.phone?.trim();
  if (!email && !phone) return NO_CONFLICT;

  try {
    const res = await fetch(`${apiUrl}/int/v1/onboard/create-account`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email, phone }),
    });

    // 422 is the expected answer here — the body IS the validator's verdict.
    const body = (await res.json().catch(() => null)) as { errors?: string[] } | null;
    const errors = body?.errors;
    if (!Array.isArray(errors)) return NO_CONFLICT;

    const said = (needle: string) =>
      errors.some((e) => typeof e === "string" && e.toLowerCase().includes(needle));

    return {
      email: Boolean(email) && said("email address already exists"),
      phone: Boolean(phone) && said("phone number already exists"),
    };
  } catch {
    return NO_CONFLICT;
  }
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
