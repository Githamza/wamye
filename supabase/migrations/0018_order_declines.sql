-- ============================================================
-- 0018 — A driver can decline a course, with a reason.
--
-- Declining hides the course for THAT driver only; it stays in every other
-- team member's feed. Refusing for everyone would hand one driver the power to
-- kill a customer's order, which is the tenant's call, not theirs.
--
-- The reason is the point of the feature: "trop loin" repeated fifty times is
-- a dispatch-radius problem, "prix trop bas" is a pricing problem, and today
-- neither is visible to anyone.
-- ============================================================

create table if not exists public.order_declines (
  order_id   uuid not null references public.orders(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  reason     text not null,
  note       text,
  created_at timestamptz not null default now(),
  primary key (order_id, profile_id)
);

alter table public.order_declines drop constraint if exists order_declines_reason_check;
alter table public.order_declines add constraint order_declines_reason_check
  check (reason in ('too_far', 'busy', 'shop_closed', 'fee_too_low', 'end_of_shift', 'other'));

create index if not exists order_declines_profile_idx
  on public.order_declines (profile_id, order_id);

alter table public.order_declines enable row level security;

-- Readable by the team (the tenant will want to see why courses go unclaimed);
-- written only through decline_course() below, so no write policy.
create policy order_declines_select on public.order_declines for select
  using (
    public.is_super_admin()
    or exists (
      select 1 from public.orders o
       where o.id = order_declines.order_id
         and o.tenant_id = public.current_tenant_id()
    )
  );

-- ---- Decline ----
create or replace function public.decline_course(
  p_order_id uuid,
  p_reason   text,
  p_note     text default null)
returns void language plpgsql security definer
set search_path = public as $$
declare v_me public.profiles;
begin
  v_me := public.active_member();
  if v_me.id is null or v_me.tenant_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Only a course of my tenant that is still up for grabs. Declining one I
  -- already took is a different action (advance_order → canceled).
  if not exists (
    select 1 from public.orders o
     where o.id = p_order_id
       and o.tenant_id = v_me.tenant_id
       and o.state = 'pending'
  ) then
    raise exception 'bad-transition' using errcode = '22023';
  end if;

  insert into public.order_declines (order_id, profile_id, reason, note)
  values (p_order_id, v_me.id, p_reason, nullif(btrim(coalesce(p_note, '')), ''))
  -- Changing your mind about the wording is not an error.
  on conflict (order_id, profile_id) do update
     set reason = excluded.reason, note = excluded.note, created_at = now();
end $$;

-- ---- The feed, minus what I have declined ----
-- An RPC rather than filtering in the client: the exclusion must hold for the
-- server-rendered first paint too, and PostgREST cannot express NOT EXISTS.
create or replace function public.feed_courses(p_window interval default '2 hours')
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

revoke all on function public.decline_course(uuid, text, text) from public;
revoke all on function public.feed_courses(interval) from public;
grant execute on function public.decline_course(uuid, text, text) to authenticated;
grant execute on function public.feed_courses(interval) to authenticated;
