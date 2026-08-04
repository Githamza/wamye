-- ============================================================
-- 0021 — Remember which business the pickup is.
--
-- Maps was handed raw coordinates, so a driver opening the itinerary saw
-- "Point sur la carte" where the restaurant's name should be. The browser has
-- had the Google place id all along — Commerce.id is one — it simply was never
-- sent with the order.
--
-- The coordinates stay authoritative. The place id is only a label for Maps:
-- letting text geocoding decide a pickup location is exactly how orders ended
-- up in Tennessee (see the note on CreateOrderInput.commercePosition).
-- ============================================================

alter table public.orders
  add column if not exists commerce_place_id text;
