-- ============================================================
-- 0013 — Web Push subscriptions (VAPID).
-- ============================================================

create table if not exists public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  endpoint      text not null unique,
  p256dh        text not null,
  auth          text not null,
  user_agent    text,
  failure_count int not null default 0,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

create index if not exists push_subscriptions_tenant_idx
  on public.push_subscriptions (tenant_id, profile_id);

-- RLS on with NO policies → service-role only, exactly like tenant_secrets.
-- The endpoint plus its keys are a send capability; nothing in the browser ever
-- needs to read them back, and profiles has no self-write policy to model on
-- (see 0004). Rows are written by a Server Action using the admin client, with
-- profile_id taken from the DAL and never from the submitted form.
alter table public.push_subscriptions enable row level security;
