-- ============================================================
-- 0019 — Fix dispatch: an unknown position is not a distant one.
--
-- eligible_push_targets (0015) required a fix newer than 30 minutes AND inside
-- the dispatch radius. But profiles.last_* is only refreshed while the PWA is
-- open in the foreground, so a driver with the phone in their pocket falls out
-- of the filter within half an hour.
--
-- The all-or-nothing fallback in the caller hid the flaw rather than fixing it:
-- one driver sitting at home 20 km away with the app open makes the result
-- non-empty, so the fallback never fires, and the three drivers actually 500 m
-- from the pickup — phones asleep — are told nothing. Silent, and more likely
-- the more active the team is.
--
-- The rule is now: exclude only drivers we KNOW are far away.
-- ============================================================

create or replace function public.eligible_push_targets(
  p_tenant_id uuid,
  p_lat       double precision default null,
  p_lng       double precision default null)
returns table (profile_id uuid, endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = public as $$
  select s.profile_id, s.endpoint, s.p256dh, s.auth
    from public.push_subscriptions s
    join public.profiles p on p.id = s.profile_id
    join public.tenants  t on t.id = s.tenant_id
   where s.tenant_id = p_tenant_id
     and p.status = 'active'
     and (
       -- No pickup to measure against.
       p_lat is null or p_lng is null
       -- Never located, or the fix has gone stale: unknown, not far.
       or p.last_position_at is null
       or p.last_lat is null or p.last_lng is null
       or p.last_position_at < now() - interval '30 minutes'
       -- Known position, and it is close enough.
       or public.haversine_km(p.last_lat, p.last_lng, p_lat, p_lng) <= t.dispatch_radius_km
     )
$$;

revoke all on function public.eligible_push_targets(uuid, double precision, double precision) from public;
