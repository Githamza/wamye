-- 0007_navigator_link_token.sql
-- Unguessable token behind a tenant's public Navigator connection page
-- (/connect/<token>), which hands the driver app its instance config. A
-- random token rather than the slug: the page's deep link carries the
-- tenant's Fleetbase API key, so the URL must not be derivable.
-- Generated lazily by the app the first time the owner needs the link.
alter table public.tenants
  add column if not exists navigator_link_token text unique;
