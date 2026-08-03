-- ============================================================
-- 0011 — Dispatch radius, and the driver position it is measured against.
-- ============================================================

-- Radius around the PICKUP inside which a member is offered a new course.
-- Deliberately separate from tenants.zone.radiusKm: the delivery zone answers
-- "can we serve this address", this answers "who gets pinged".
alter table public.tenants
  add column if not exists dispatch_radius_km numeric not null default 8;

-- A radius around the pickup is only computable against a driver position, and
-- the driver we most want to reach is the idle one — who has no active course.
-- These are refreshed by the PWA's foreground geolocation loop whenever the app
-- is open, course or not. Dispatch treats a fix older than 30 minutes as absent
-- and falls back to broadcasting to every active member.
alter table public.profiles
  add column if not exists last_lat         double precision,
  add column if not exists last_lng         double precision,
  add column if not exists last_position_at timestamptz;
