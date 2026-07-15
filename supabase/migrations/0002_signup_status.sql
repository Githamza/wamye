-- 0002_signup_status.sql
-- Self-registration: tenants now start "pending" and are activated by a
-- super-admin (who also connects their Fleetbase) before they can use the
-- dashboard. `status` drives the approval workflow; `is_active` stays as the
-- public-page on/off flag.
--   pending  = self-registered, awaiting super-admin approval (public page off)
--   active   = approved + Fleetbase connected (public page on)
--   suspended = manually disabled after approval

alter table public.tenants
  add column if not exists status text not null default 'pending'
    check (status in ('pending', 'active', 'suspended'));

-- Backfill: every tenant that predates self-signup is already live.
update public.tenants set status = 'active' where is_active = true;
