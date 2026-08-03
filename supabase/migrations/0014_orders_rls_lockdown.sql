-- ============================================================
-- 0014 — Take write access to `orders` away from the browser.
--
-- SECURITY FIX. The `orders_tenant for all` policy from 0001 let any active
-- member of a tenant UPDATE any order in that tenant straight from devtools
-- with the anon key — including `set driver_id = me, state = 'accepted'`, which
-- defeats accept_order() and the whole first-to-accept-wins guarantee.
--
-- Same reasoning as 0004_profiles_update_lockdown.sql: RLS cannot restrict
-- which columns a policy allows, so the write must not be granted at all.
-- ============================================================

drop policy if exists orders_tenant on public.orders;

create policy orders_select_tenant on public.orders for select
  using (public.is_super_admin() or tenant_id = public.current_tenant_id());

-- No INSERT / UPDATE / DELETE policy, on purpose:
--   * order creation runs through the service role (the customer placing the
--     order is anonymous — there is no auth user to write as);
--   * every driver transition runs through the SECURITY DEFINER functions in
--     0015, which are the only place a legal state-machine edge is expressed.
