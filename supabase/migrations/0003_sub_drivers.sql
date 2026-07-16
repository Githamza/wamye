-- 0003_sub_drivers.sql
-- Sub-drivers: a driver (tenant owner) can add team members who share the
-- tenant. This is the first case of MULTIPLE users per tenant.
--
-- Team hierarchy is a column, not a new user_role value: `role` stays a
-- PLATFORM role (super_admin vs tenant user), while parent_profile_id
-- expresses a tenant-internal relationship.
--   parent_profile_id null     = the owner (the original signup)
--   parent_profile_id not null = a sub-driver added by that owner
--
-- Sub-drivers share the tenant_id, so the existing tenant-scoped RLS on
-- orders/clients/commerces gives them the team's jobs for free — that is the
-- "shared pool". Fleetbase adhoc broadcast is the actual claim mechanism.

alter table public.profiles
  add column if not exists parent_profile_id uuid
    references public.profiles(id) on delete cascade,
  -- Owners predate this column and are already live → default 'active'.
  -- Sub-drivers are inserted 'pending' and wait for super-admin approval.
  add column if not exists status text not null default 'active'
    check (status in ('pending', 'active', 'suspended')),
  add column if not exists phone text,
  -- The team member's Fleetbase driver record (POST /v1/drivers), scoped to
  -- the tenant's Fleetbase company by that tenant's API key.
  add column if not exists fleetbase_driver_id text;

create index if not exists profiles_tenant_idx on public.profiles (tenant_id);
create index if not exists profiles_parent_idx on public.profiles (parent_profile_id);

-- ============================================================
-- A pending/suspended member is invisible at the DB layer, not just redirected
-- ============================================================
-- Adding `status = 'active'` makes every tenant-scoped policy fail closed for a
-- member who isn't approved yet: they hold a valid session but current_tenant_id()
-- returns null, so orders/clients/commerces/tenants all return zero rows.
--
-- Owners are unaffected: they default to 'active' and their pending-ness lives
-- in tenants.status, which /pending reads separately.
create or replace function public.current_tenant_id()
returns uuid language sql stable security definer set search_path = public as $$
  select tenant_id from public.profiles where id = auth.uid() and status = 'active'
$$;

-- ============================================================
-- Let a team read itself
-- ============================================================
-- profiles_select_self is (id = auth.uid() or is_super_admin()), so an owner
-- could not see their own sub-drivers. This second permissive SELECT policy is
-- OR'd with it. No recursion: current_tenant_id() is security definer.
-- Inserts/deletes stay service-role only (as onboarding already does).
drop policy if exists profiles_select_team on public.profiles;
create policy profiles_select_team on public.profiles for select
  using (tenant_id = public.current_tenant_id());
