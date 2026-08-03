-- ============================================================
-- 0009 — Reconcile the migration history with the live database.
--
-- `profiles.locale` is read by src/lib/auth/dal.ts and written by
-- src/lib/actions/locale.ts, but it was applied out of band and appears in no
-- migration file: a fresh `supabase db reset` produced a schema the code could
-- not run against. Verified 2026-08-03 against the live project — it is the
-- ONLY drift across profiles / orders / tenants / clients.
--
-- Everything here is idempotent: a no-op on production, correct on a fresh DB.
-- ============================================================

alter table public.profiles add column if not exists locale text;

-- Deliberately nullable rather than `not null default 'fr'`: getProfile()
-- already narrows a null through hasLocale() to DEFAULT_LOCALE, and forcing
-- NOT NULL onto a live column is the one thing here that could fail.
alter table public.profiles drop constraint if exists profiles_locale_check;
alter table public.profiles add constraint profiles_locale_check
  check (locale is null or locale in ('fr', 'ar-TN'));

-- ---- Denormalised email ----
-- Emails live in auth.users. The new-order alert has to fan out to every active
-- member of a tenant; doing one auth.admin.getUserById() per recipient per order
-- is not viable. Kept in sync by signupDriver() and addSubDriver().
alter table public.profiles add column if not exists email text;

update public.profiles p
   set email = u.email
  from auth.users u
 where u.id = p.id and p.email is null;

create index if not exists profiles_tenant_status_idx
  on public.profiles (tenant_id, status);
