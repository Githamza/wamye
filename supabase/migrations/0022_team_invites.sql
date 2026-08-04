-- ============================================================
-- 0022 — Rejoindre une équipe par invitation.
--
-- Until now the only way onto a team was addSubDriver: the owner typed their
-- driver's email AND password, then a super-admin approved. The owner knew
-- their drivers' passwords and could not staff their own team.
--
-- An invitation replaces that. The owner shares a link (or a dictable code);
-- the driver signs themselves up with their own password and lands 'pending';
-- the OWNER accepts or refuses.
--
-- Nothing here touches RLS, and that is the point. A 'pending' member's
-- current_tenant_id() is null (0003), so a leaked invite link grants exactly
-- nothing — orders, clients and driver_positions all return zero rows until
-- the owner says yes. The invite only puts a request on the owner's desk.
-- ============================================================

create table if not exists public.team_invites (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  -- The owner who minted it. Its value is read back as the new member's
  -- parent_profile_id, so the team hierarchy comes from the invite, never
  -- from the joining browser.
  created_by uuid not null references public.profiles(id) on delete cascade,

  -- The secret in the URL. Same shape and same reasoning as
  -- orders.tracking_token (0010): unguessable, and the capability itself.
  token      text not null unique default encode(gen_random_bytes(16), 'hex'),
  -- The version an owner can read out over the phone. Generated app-side so
  -- the alphabet can drop 0/O/1/I — see src/lib/invites.ts.
  code       text not null unique,

  expires_at timestamptz not null default now() + interval '30 days',
  -- null = no ceiling. A team hires until it stops; a fixed count would mostly
  -- produce "the link stopped working" support calls.
  max_uses   integer,
  uses       integer not null default 0,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- At most ONE live invitation per team. Regenerating stamps revoked_at on the
-- old row and inserts a new one, so the owner always has a single stable QR to
-- show and a single thing to burn if the link ends up in the wrong group chat.
create unique index if not exists team_invites_live_idx
  on public.team_invites (tenant_id) where revoked_at is null;

-- The lookup the public /rejoindre page does on every visit.
create index if not exists team_invites_token_idx on public.team_invites (token);

alter table public.team_invites enable row level security;
-- No policies, deliberately — service role only, like tenant_secrets (0001)
-- and push_subscriptions (0013). The public join page has no auth user to
-- scope a policy to, and the owner-facing reads all go through server actions
-- that have already proved ownership via requireOwner().

-- Which invitation a member came in through. Audit only: nothing reads it to
-- make a decision, so ON DELETE SET NULL is safe.
alter table public.profiles
  add column if not exists joined_via_invite uuid
    references public.team_invites(id) on delete set null;
