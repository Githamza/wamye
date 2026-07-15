-- ============================================================
-- Wamya multi-tenant schema + Row-Level Security.
--
-- Tenant isolation is enforced at the DATABASE level: every tenant-scoped
-- table is filtered by the caller's tenant_id via RLS. This is the primary
-- guarantee that "orders never reach another tenant".
--
-- Access model:
--   - Dashboard users authenticate via Supabase Auth. Their profile row
--     ties auth.users.id -> tenant_id + role. RLS uses that.
--   - The anonymous public ordering page has no auth user; it reads
--     non-secret tenant config and writes orders/clients through the
--     service-role client (bypasses RLS) on the server only.
--   - tenant_secrets (the encrypted Fleetbase key) has RLS enabled and NO
--     policies, so it is reachable by the service role alone.
-- ============================================================

create extension if not exists pgcrypto;

-- ---- Roles -------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('super_admin', 'tenant_admin');
exception when duplicate_object then null; end $$;

-- ---- Tenants -----------------------------------------------------
create table if not exists public.tenants (
  id                       uuid primary key default gen_random_uuid(),
  slug                     text unique not null,
  name                     text not null,
  branding                 jsonb not null default '{}'::jsonb,
  zone                     jsonb not null,           -- {centerLat,centerLng,radiusKm}
  fee_config               jsonb not null,           -- {baseFee,feePerKm,minFee}
  hours                    jsonb not null,           -- {openHour,closeHour,alwaysOpen}
  phone_country            text not null default 'TN',
  fleetbase_api_url        text,
  fleetbase_company_id     text,
  fleetbase_order_type     text default 'storefront',
  fleetbase_dispatch       boolean not null default true,
  fleetbase_adhoc          boolean not null default true,
  fleetbase_adhoc_distance integer,
  is_active                boolean not null default true,
  created_at               timestamptz not null default now()
);

-- ---- Tenant secrets (service-role only) --------------------------
create table if not exists public.tenant_secrets (
  tenant_id                   uuid primary key references public.tenants(id) on delete cascade,
  fleetbase_api_key_encrypted text,   -- AES-256-GCM blob (see src/lib/crypto.ts)
  updated_at                  timestamptz not null default now()
);

-- ---- Profiles (1:1 with auth.users) ------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  tenant_id  uuid references public.tenants(id) on delete cascade,  -- null = super_admin
  role       public.user_role not null default 'tenant_admin',
  name       text,
  created_at timestamptz not null default now()
);

-- ---- Clients (per tenant) ----------------------------------------
create table if not exists public.clients (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  phone       text not null,
  name        text,
  last_repere text,
  created_at  timestamptz not null default now(),
  unique (tenant_id, phone)
);

-- ---- Commerces (per tenant; replaces the hardcoded list) ---------
create table if not exists public.commerces (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  name       text not null,
  addr       text not null,
  lat        double precision,
  lng        double precision,
  place_id   text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---- Orders (dashboard mirror; Fleetbase stays source of truth) --
create table if not exists public.orders (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  fleetbase_id   text unique,
  tracking_number text,
  status         text,
  stage          text,
  client_id      uuid references public.clients(id) on delete set null,
  phone          text,
  commerce_name  text,
  order_text     text,
  fee            numeric,
  distance_km    numeric,
  quote_source   text,
  position       jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists orders_tenant_created_idx on public.orders (tenant_id, created_at desc);
create index if not exists clients_tenant_idx on public.clients (tenant_id);
create index if not exists commerces_tenant_idx on public.commerces (tenant_id);

-- ============================================================
-- RLS helper functions (security definer → bypass RLS, avoid recursion)
-- ============================================================
create or replace function public.current_tenant_id()
returns uuid language sql stable security definer set search_path = public as $$
  select tenant_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'super_admin'
  )
$$;

-- ============================================================
-- Enable RLS everywhere
-- ============================================================
alter table public.tenants        enable row level security;
alter table public.tenant_secrets enable row level security;   -- no policies → service-role only
alter table public.profiles       enable row level security;
alter table public.clients        enable row level security;
alter table public.commerces      enable row level security;
alter table public.orders         enable row level security;

-- ---- tenants ----
create policy tenants_select on public.tenants for select
  using (public.is_super_admin() or id = public.current_tenant_id());
create policy tenants_write on public.tenants for all
  using (public.is_super_admin()) with check (public.is_super_admin());

-- ---- profiles ----
create policy profiles_select_self on public.profiles for select
  using (id = auth.uid() or public.is_super_admin());
create policy profiles_update_self on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
-- inserts/deletes of profiles are done by the service role during onboarding.

-- ---- tenant-scoped tables (clients / commerces / orders) ----
create policy clients_tenant on public.clients for all
  using (public.is_super_admin() or tenant_id = public.current_tenant_id())
  with check (public.is_super_admin() or tenant_id = public.current_tenant_id());

create policy commerces_tenant on public.commerces for all
  using (public.is_super_admin() or tenant_id = public.current_tenant_id())
  with check (public.is_super_admin() or tenant_id = public.current_tenant_id());

create policy orders_tenant on public.orders for all
  using (public.is_super_admin() or tenant_id = public.current_tenant_id())
  with check (public.is_super_admin() or tenant_id = public.current_tenant_id());

-- ---- keep orders.updated_at fresh ----
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists orders_touch_updated_at on public.orders;
create trigger orders_touch_updated_at before update on public.orders
  for each row execute function public.touch_updated_at();
