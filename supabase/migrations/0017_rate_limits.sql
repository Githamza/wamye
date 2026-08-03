-- ============================================================
-- 0017 — Rate limiting, in Postgres.
--
-- POST /api/orders is public, unauthenticated and currently unthrottled; so is
-- signupDriver (which carries its own TODO saying so). An in-memory Map will
-- not do: `output: "standalone"` can run several containers and route-handler
-- module state is not shared between them.
-- ============================================================

create table if not exists public.rate_limits (
  key          text primary key,
  window_start timestamptz not null default now(),
  hits         int not null default 0
);

-- Returns true when the call is allowed, false when the caller is over budget.
-- Fixed window: coarse, but it is a spam brake, not an accounting system.
create or replace function public.hit_rate_limit(
  p_key    text,
  p_limit  int,
  p_window interval)
returns boolean language plpgsql security definer
set search_path = public as $$
declare v_hits int;
begin
  insert into public.rate_limits (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update
     set window_start = case when public.rate_limits.window_start < now() - p_window
                             then now() else public.rate_limits.window_start end,
         hits         = case when public.rate_limits.window_start < now() - p_window
                             then 1 else public.rate_limits.hits + 1 end
  returning hits into v_hits;

  return v_hits <= p_limit;
end $$;

alter table public.rate_limits enable row level security;  -- no policies → service-role only

revoke all on function public.hit_rate_limit(text, int, interval) from public;

-- Housekeeping: rows for keys nobody hits again would accumulate forever.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule(
    'prune-rate-limits',
    '23 4 * * *',
    $sweep$delete from public.rate_limits where window_start < now() - interval '1 day'$sweep$
  );
exception when others then
  raise notice 'pg_cron unavailable — schedule the rate_limits sweep manually';
end $$;
