// ============================================================
// Team invitations — SERVER ONLY.
//
// One live invitation per team (enforced by team_invites_live_idx). The owner
// shares either the link — /rejoindre/<token>, which is what the QR encodes —
// or the short code, for when the whole exchange happens over the phone.
//
// The token IS the capability, so it is random rather than derived from the
// slug, and the page behind it is noindex. It is a low-stakes secret though:
// holding it only lets someone ASK to join. A 'pending' member sees nothing
// (current_tenant_id() is null until the owner accepts), so the link cannot
// leak data — at worst it produces junk requests, which regenerating kills.
// ============================================================

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteOrigin } from "@/lib/site-url";

export type TeamInvite = {
  id: string;
  tenantId: string;
  createdBy: string;
  token: string;
  code: string;
  expiresAt: string;
  maxUses: number | null;
  uses: number;
};

const COLUMNS = "id, tenant_id, created_by, token, code, expires_at, max_uses, uses";

/** Crockford-ish: no 0/O/1/I/L/U, so a code read aloud survives the retelling. */
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 6;

function generateCode(): string {
  // Rejection-free because 256 % 30 != 0 would bias, and the bias here is
  // irrelevant: the code is a convenience handle, the token is the secret.
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  let out = "";
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

function shape(row: Record<string, unknown>): TeamInvite {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    createdBy: row.created_by as string,
    token: row.token as string,
    code: row.code as string,
    expiresAt: row.expires_at as string,
    maxUses: (row.max_uses as number | null) ?? null,
    uses: (row.uses as number) ?? 0,
  };
}

/**
 * The team's live invitation, minted on first use.
 *
 * Concurrency is settled by team_invites_live_idx rather than a lock: two
 * simultaneous mints both insert, one hits the unique violation and re-reads
 * the winner. Same shape as the token mint this replaced.
 */
export async function getOrCreateTeamInvite(
  tenantId: string,
  ownerId: string,
): Promise<TeamInvite | null> {
  const supabase = createAdminClient();
  const live = await readLive(tenantId);
  if (live) return live;

  const { data, error } = await supabase
    .from("team_invites")
    .insert({ tenant_id: tenantId, created_by: ownerId, code: generateCode() })
    .select(COLUMNS)
    .maybeSingle();
  if (data) return shape(data);

  if (error) console.error("[invites] mint failed:", error.message);
  return await readLive(tenantId);
}

/**
 * Burn the current invitation and mint a fresh one. The revoke and the insert
 * are two statements: the partial unique index means the insert would fail
 * while the old row is still live, so the order matters and a crash between
 * them leaves the team with no invitation — which the next page load remints.
 */
export async function regenerateTeamInvite(
  tenantId: string,
  ownerId: string,
): Promise<TeamInvite | null> {
  const supabase = createAdminClient();
  await supabase
    .from("team_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .is("revoked_at", null);
  return await getOrCreateTeamInvite(tenantId, ownerId);
}

async function readLive(tenantId: string): Promise<TeamInvite | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("team_invites")
    .select(COLUMNS)
    .eq("tenant_id", tenantId)
    .is("revoked_at", null)
    .maybeSingle();
  return data ? shape(data) : null;
}

/** Why an invitation cannot be used. `null` means it can. */
export type InviteRefusal = "unknown" | "expired" | "used-up" | "tenant-inactive";

export type InviteLookup =
  | { ok: true; invite: TeamInvite; tenant: { id: string; name: string; branding: unknown } }
  | { ok: false; reason: InviteRefusal };

/**
 * Resolve an invite token for the public join page, refusal reason included so
 * the page can say "ce lien a expiré" rather than 404 — the link was real, and
 * a driver who scanned a stale QR needs to know to ask for a new one.
 */
export async function lookupInvite(token: string): Promise<InviteLookup> {
  if (!token) return { ok: false, reason: "unknown" };

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("team_invites")
    .select(`${COLUMNS}, revoked_at`)
    .eq("token", token)
    .maybeSingle();
  if (!data || data.revoked_at) return { ok: false, reason: "unknown" };

  const invite = shape(data);
  if (new Date(invite.expiresAt).getTime() <= Date.now()) {
    return { ok: false, reason: "expired" };
  }
  if (invite.maxUses !== null && invite.uses >= invite.maxUses) {
    return { ok: false, reason: "used-up" };
  }

  // A suspended or not-yet-approved business must not recruit: its members
  // would sit behind the layout's tenant gate with no way forward.
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name, branding, status, is_active")
    .eq("id", invite.tenantId)
    .maybeSingle();
  if (!tenant || tenant.status !== "active" || !tenant.is_active) {
    return { ok: false, reason: "tenant-inactive" };
  }

  return {
    ok: true,
    invite,
    tenant: {
      id: tenant.id as string,
      name: tenant.name as string,
      branding: tenant.branding,
    },
  };
}

/**
 * The token behind a dictated code, for the /rejoindre code box. Returns the
 * token rather than the invite so the caller lands on the same URL the QR
 * would have opened — one page, one code path.
 */
export async function tokenForCode(code: string): Promise<string | null> {
  const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (normalized.length !== CODE_LENGTH) return null;

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("team_invites")
    .select("token")
    .eq("code", normalized)
    .is("revoked_at", null)
    .maybeSingle();
  return (data?.token as string | null) ?? null;
}

/** Count one accepted use. Best effort — a lost increment is not worth failing
 *  a join that already created the account. */
export async function countInviteUse(inviteId: string, from: number): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("team_invites")
    .update({ uses: from + 1 })
    .eq("id", inviteId);
  if (error) console.error("[invites] use count failed:", error.message);
}

/** Absolute link an owner shares, and what the QR on the team page encodes. */
export async function inviteUrl(token: string): Promise<string> {
  return `${await siteOrigin()}/rejoindre/${token}`;
}
