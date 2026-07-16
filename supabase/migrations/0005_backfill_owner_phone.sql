-- 0005_backfill_owner_phone.sql
-- profiles.phone (added in 0003) is required to register a team member as a
-- Fleetbase driver. Existing owners predate the column, so seed it from their
-- tenant's support phone — for a solo driver that IS their number. The owner
-- can correct it on /dashboard/team before syncing.
update public.profiles p
   set phone = nullif(trim(t.branding ->> 'supportPhone'), '')
  from public.tenants t
 where t.id = p.tenant_id
   and p.phone is null
   and p.parent_profile_id is null;
