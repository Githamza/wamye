-- ============================================================
-- 0012 — Driver position trail, for the customer's live tracking map.
-- Written only while a course is active and the PWA is in the foreground.
-- ============================================================

create table if not exists public.driver_positions (
  id          bigserial primary key,
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  order_id    uuid references public.orders(id) on delete cascade,
  driver_id   uuid not null references public.profiles(id) on delete cascade,
  lat         double precision not null,
  lng         double precision not null,
  accuracy_m  double precision,
  heading     double precision,
  speed_mps   double precision,
  recorded_at timestamptz not null default now()
);

create index if not exists driver_positions_order_idx
  on public.driver_positions (order_id, recorded_at desc);
create index if not exists driver_positions_recorded_idx
  on public.driver_positions (recorded_at);

alter table public.driver_positions enable row level security;

-- Read for the team; writes go exclusively through record_driver_position()
-- in 0015, so there is deliberately no insert/update/delete policy.
create policy driver_positions_select on public.driver_positions for select
  using (public.is_super_admin() or tenant_id = public.current_tenant_id());

-- One course produces ~4 rows/minute. Ten drivers over a working day is ~19k
-- rows per tenant per day, so this table must not be left unbounded.
-- pg_cron is available on Supabase; enable it and schedule the sweep. If the
-- extension is unavailable, run the same DELETE from a scheduled task instead.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule(
    'prune-driver-positions',
    '17 3 * * *',
    $sweep$delete from public.driver_positions where recorded_at < now() - interval '7 days'$sweep$
  );
exception when others then
  raise notice 'pg_cron unavailable — schedule the driver_positions sweep manually';
end $$;
