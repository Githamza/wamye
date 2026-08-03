-- ============================================================
-- 0010 — `orders` becomes the source of truth.
--
-- Until now this table was a best-effort mirror of Fleetbase written once and
-- never updated (recordOrderMirror even swallowed its own errors). It now
-- carries the whole delivery lifecycle: who took the course, where the pickup
-- actually is, when each step happened, and the proof.
--
-- Additive and deploy-safe: every column is nullable or defaulted, and no code
-- reads them yet.
-- ============================================================

alter table public.orders
  add column if not exists driver_id     uuid references public.profiles(id) on delete set null,
  -- Pickup coordinates were never stored, though the browser always sent them.
  add column if not exists pickup_lat    double precision,
  add column if not exists pickup_lng    double precision,
  add column if not exists dropoff_lat   double precision,
  add column if not exists dropoff_lng   double precision,
  add column if not exists commerce_addr text,
  add column if not exists repere        text,
  add column if not exists customer_name text,
  add column if not exists accepted_at   timestamptz,
  add column if not exists picked_up_at  timestamptz,
  add column if not exists delivered_at  timestamptz,
  add column if not exists canceled_at   timestamptz,
  add column if not exists problem_at    timestamptz,
  add column if not exists problem_note  text,
  add column if not exists proof_path    text,
  -- Last known driver fix, denormalised so the customer tracking read stays a
  -- single row lookup (driver_positions keeps the full trail).
  add column if not exists driver_lat    double precision,
  add column if not exists driver_lng    double precision,
  add column if not exists driver_pos_at timestamptz;

-- Unguessable per-order tracking capability. Replaces "any id is readable by
-- anyone" on the old GET /api/orders/[id].
alter table public.orders
  add column if not exists tracking_token text not null
    default encode(gen_random_bytes(16), 'hex');
create unique index if not exists orders_tracking_token_idx
  on public.orders (tracking_token);

-- ---- The driver-facing lifecycle ----
-- A CHECK, not a pg enum: matches the precedent set by tenants.status and
-- profiles.status, and stays editable (ALTER TYPE ... ADD VALUE is one-way).
alter table public.orders
  add column if not exists state text not null default 'pending';

alter table public.orders drop constraint if exists orders_state_check;
alter table public.orders add constraint orders_state_check
  check (state in ('pending', 'accepted', 'picked_up', 'delivered', 'problem', 'canceled'));

-- Backfill the dropoff point out of the legacy jsonb.
update public.orders
   set dropoff_lat = (position ->> 'lat')::double precision,
       dropoff_lng = (position ->> 'lng')::double precision
 where position is not null and dropoff_lat is null;

-- CRITICAL — close out every Fleetbase-era row. Without this they all inherit
-- state='pending' and flood the driver feed with years of history on day one.
update public.orders
   set state = case when stage = 'canceled' then 'canceled' else 'delivered' end
 where fleetbase_id is not null;

create index if not exists orders_feed_idx
  on public.orders (tenant_id, created_at desc) where state = 'pending';
create index if not exists orders_driver_idx
  on public.orders (driver_id, state);

-- `status`, `stage`, `position` and `fleetbase_id` stay for now: the running
-- dashboard still reads stage/status. They go once the code is switched over
-- (0018), except fleetbase_id which is kept forever as the key back to history.
