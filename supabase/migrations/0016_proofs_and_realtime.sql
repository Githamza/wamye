-- ============================================================
-- 0016 — Delivery-proof storage and Realtime on orders.
-- ============================================================

-- ---- Proof photos ----
insert into storage.buckets (id, name, public)
values ('delivery-proofs', 'delivery-proofs', false)
on conflict (id) do nothing;

-- Path convention: {tenant_id}/{order_id}/{uuid}.jpg — the first segment is the
-- tenancy boundary, which is what both policies check. The browser uploads
-- straight to Storage (a phone photo blows past the 1 MB Server Action body
-- cap), so the path it chooses has to be constrained here.
drop policy if exists proofs_insert on storage.objects;
create policy proofs_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'delivery-proofs'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
  );

drop policy if exists proofs_read on storage.objects;
create policy proofs_read on storage.objects for select to authenticated
  using (
    bucket_id = 'delivery-proofs'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
  );
-- No update/delete policy: a proof is write-once. The customer sees it through
-- a short-lived signed URL minted server-side by the tracking route.

-- ---- Realtime ----
-- RLS still applies to postgres_changes for an authenticated client, so
-- orders_select_tenant (0014) is what scopes the driver feed. The anonymous
-- customer never gets a channel — tracking is a polled route handler, which is
-- precisely why 0014 grants the anon role nothing on this table.
alter table public.orders replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.orders;
exception when duplicate_object then
  null;
end $$;
