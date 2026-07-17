-- ---- Drop the per-tenant commerces table ------------------------
-- The customer now searches Google Places directly for the pickup shop
-- (see commerce-combo.tsx), so the curated per-tenant list is gone: no
-- code reads this table, and the dashboard "Commerces" section was removed.
-- CASCADE also drops commerces_tenant_idx and the commerces_tenant RLS policy.
-- Note: orders.commerce_name is a separate column (the shop name stamped on
-- each order) and is intentionally kept.
drop table if exists public.commerces cascade;
