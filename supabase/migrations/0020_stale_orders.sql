-- ============================================================
-- 0020 — No order dies in silence.
--
-- feed_courses() showed the last 2 hours, but nothing ever closed an order that
-- went unclaimed. Past the window a course vanished from every driver's screen
-- while staying `pending` for ever: a customer waiting, and nobody — not the
-- drivers, not the tenant, not us — aware of it. Found one live, four hours old.
--
-- Two fixes, and the first is the important one:
--
--   * the feed window and the expiry are now THE SAME NUMBER. A course is
--     visible for exactly as long as it can still be taken. Any gap between
--     those two values recreates the black hole.
--   * the tenant owner is told at 30 minutes, while there is still time to
--     phone someone. Deciding what to do about an unclaimed order is theirs,
--     not the system's.
-- ============================================================

-- Stamped when the owner has been warned, so the sweep does not email every run.
alter table public.orders
  add column if not exists unclaimed_alert_at timestamptz;

create index if not exists orders_pending_created_idx
  on public.orders (created_at) where state = 'pending';

-- Feed window raised to match the expiry below. Callers pass it explicitly;
-- this default is the contract.
create or replace function public.feed_courses(p_window interval default '3 hours')
returns setof public.orders
language sql stable security definer set search_path = public as $$
  select o.*
    from public.orders o
    join public.profiles p on p.id = auth.uid() and p.status = 'active'
   where o.tenant_id = p.tenant_id
     and o.state = 'pending'
     and o.created_at > now() - p_window
     and not exists (
       select 1 from public.order_declines d
        where d.order_id = o.id and d.profile_id = p.id
     )
   order by o.created_at desc
   limit 50
$$;

-- ---- Expiry ----
-- Returns what it closed, so the caller can tell the tenant. Cancelling is the
-- honest outcome: the customer's tracking page shows a course that is over
-- rather than one eternally "looking for a driver".
create or replace function public.expire_stale_orders(p_after interval default '3 hours')
returns table (id uuid, tenant_id uuid, commerce_name text, phone text, created_at timestamptz)
language sql security definer set search_path = public as $$
  update public.orders o
     set state = 'canceled',
         canceled_at = now(),
         problem_note = coalesce(o.problem_note, 'expiré : aucun livreur ne l''a prise')
   where o.state = 'pending'
     and o.created_at < now() - p_after
  returning o.id, o.tenant_id, o.commerce_name, o.phone, o.created_at
$$;

-- ---- Unclaimed alert ----
-- Stamps and returns in one statement: two sweeps running at once cannot both
-- pick up the same order, so the owner is never emailed twice about it.
create or replace function public.claim_unclaimed_alerts(p_after interval default '30 minutes')
returns table (id uuid, tenant_id uuid, commerce_name text, phone text, created_at timestamptz)
language sql security definer set search_path = public as $$
  update public.orders o
     set unclaimed_alert_at = now()
   where o.state = 'pending'
     and o.unclaimed_alert_at is null
     and o.created_at < now() - p_after
  returning o.id, o.tenant_id, o.commerce_name, o.phone, o.created_at
$$;

-- Service-role only: these are swept by the app, never by a signed-in user.
revoke all on function public.expire_stale_orders(interval) from public;
revoke all on function public.claim_unclaimed_alerts(interval) from public;
