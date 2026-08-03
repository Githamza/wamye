-- ============================================================
-- 0015 — The dispatch state machine.
--
-- Every write to `orders` by a signed-in driver goes through here (0014 removed
-- the write policy), so this file is the single place a legal transition is
-- defined — and the single place the accept race is settled.
-- ============================================================

-- Haversine in SQL. No PostGIS on this project (pgcrypto only) and one distance
-- predicate does not justify the extension; src/lib/geo.ts holds the JS twin
-- used by the driver feed. Revisit past ~10k concurrent open orders.
create or replace function public.haversine_km(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision)
returns double precision language sql immutable parallel safe as $$
  select 6371 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) *
    power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

-- The caller, resolved once. Mirrors current_tenant_id()'s rule from 0003:
-- a pending or suspended member is nobody.
create or replace function public.active_member()
returns public.profiles language sql stable security definer
set search_path = public as $$
  select * from public.profiles where id = auth.uid() and status = 'active'
$$;

-- ---- FIRST TO ACCEPT WINS ----
-- The atomicity is the single UPDATE ... WHERE state = 'pending'. Two drivers
-- tapping at once both target the row; the second blocks on the row lock and,
-- under READ COMMITTED, re-evaluates its WHERE against the winner's committed
-- version once released — where state is already 'accepted', so it matches zero
-- rows. No advisory lock, no SELECT FOR UPDATE, no retry loop.
create or replace function public.accept_order(p_order_id uuid)
returns public.orders language plpgsql security definer
set search_path = public as $$
declare
  v_me    public.profiles;
  v_order public.orders;
begin
  v_me := public.active_member();
  if v_me.id is null or v_me.tenant_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.orders
     set driver_id = v_me.id, state = 'accepted', accepted_at = now()
   where id = p_order_id
     and tenant_id = v_me.tenant_id
     and state = 'pending'
     and driver_id is null
  returning * into v_order;

  if v_order.id is null then
    raise exception 'already-taken' using errcode = 'P0001';
  end if;
  return v_order;
end $$;

-- The dispatch radius is deliberately NOT enforced here. It is a notification
-- filter, not a permission: a driver whose GPS was off, or who was 9 km away
-- when the ping fired and is 2 km away now, must not be locked out of a course
-- nobody else took. Enforcing it would surface as inexplicable "already-taken".

-- ---- The rest of the machine, each edge guarded by its predecessor ----
create or replace function public.advance_order(
  p_order_id uuid,
  p_to       text,
  p_note     text default null,
  p_proof    text default null)
returns public.orders language plpgsql security definer
set search_path = public as $$
declare
  v_me    public.profiles;
  v_order public.orders;
  v_from  text;
begin
  v_me := public.active_member();
  if v_me.id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_from := case p_to
    when 'picked_up' then 'accepted'
    when 'delivered' then 'picked_up'
    else null end;

  if p_to in ('problem', 'canceled') then
    -- Bailing out is legal from anywhere in the middle of the course.
    update public.orders
       set state        = p_to,
           problem_at   = case when p_to = 'problem'  then now() else problem_at end,
           canceled_at  = case when p_to = 'canceled' then now() else canceled_at end,
           problem_note = coalesce(p_note, problem_note)
     where id = p_order_id
       and driver_id = v_me.id
       and state in ('accepted', 'picked_up')
    returning * into v_order;
  elsif v_from is not null then
    update public.orders
       set state        = p_to,
           picked_up_at = case when p_to = 'picked_up' then now() else picked_up_at end,
           delivered_at = case when p_to = 'delivered' then now() else delivered_at end,
           proof_path   = coalesce(p_proof, proof_path)
     where id = p_order_id
       and driver_id = v_me.id
       and state = v_from
    returning * into v_order;
  else
    raise exception 'bad-transition' using errcode = '22023';
  end if;

  if v_order.id is null then
    raise exception 'bad-transition' using errcode = '22023';
  end if;
  return v_order;
end $$;

-- ---- GPS ingest: the trail, the denormalised order fix, and the idle
--      position dispatch reads — one roundtrip. ----
create or replace function public.record_driver_position(
  p_order_id uuid,
  p_lat      double precision,
  p_lng      double precision,
  p_accuracy double precision default null,
  p_heading  double precision default null,
  p_speed    double precision default null)
returns void language plpgsql security definer
set search_path = public as $$
declare v_me public.profiles;
begin
  v_me := public.active_member();
  if v_me.id is null or v_me.tenant_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Always: this is what makes the dispatch radius computable for an idle driver.
  update public.profiles
     set last_lat = p_lat, last_lng = p_lng, last_position_at = now()
   where id = v_me.id;

  if p_order_id is not null then
    insert into public.driver_positions
      (tenant_id, order_id, driver_id, lat, lng, accuracy_m, heading, speed_mps)
    select v_me.tenant_id, p_order_id, v_me.id, p_lat, p_lng, p_accuracy, p_heading, p_speed
     where exists (
       select 1 from public.orders o
        where o.id = p_order_id
          and o.driver_id = v_me.id
          and o.state in ('accepted', 'picked_up'));

    update public.orders
       set driver_lat = p_lat, driver_lng = p_lng, driver_pos_at = now()
     where id = p_order_id
       and driver_id = v_me.id
       and state in ('accepted', 'picked_up');
  end if;
end $$;

-- ---- Who gets pinged for a new course ----
-- Active members of the tenant holding a push subscription, whose last known
-- fix is fresh AND within the tenant's dispatch radius of the pickup. When that
-- yields nobody (cold start, everyone's GPS off), the caller re-runs with
-- p_lat/p_lng null to reach every active member — an order nobody is told
-- about is worse than one too many notifications.
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
       p_lat is null or p_lng is null
       or (p.last_position_at > now() - interval '30 minutes'
           and p.last_lat is not null
           and public.haversine_km(p.last_lat, p.last_lng, p_lat, p_lng) <= t.dispatch_radius_km)
     )
$$;

-- ---- Grants ----
-- SECURITY DEFINER functions are executable by PUBLIC unless revoked.
revoke all on function public.accept_order(uuid) from public;
revoke all on function public.advance_order(uuid, text, text, text) from public;
revoke all on function public.record_driver_position(uuid, double precision, double precision, double precision, double precision, double precision) from public;
revoke all on function public.active_member() from public;
revoke all on function public.eligible_push_targets(uuid, double precision, double precision) from public;

grant execute on function public.accept_order(uuid) to authenticated;
grant execute on function public.advance_order(uuid, text, text, text) to authenticated;
grant execute on function public.record_driver_position(uuid, double precision, double precision, double precision, double precision, double precision) to authenticated;
-- active_member() and eligible_push_targets() stay service-role only.
