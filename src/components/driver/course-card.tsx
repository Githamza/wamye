"use client";

import { useTranslations } from "next-intl";
import { formatDinar } from "@/lib/format";
import type { DriverOrder } from "@/lib/order-types";
import type { LatLng } from "@/lib/order-types";
import { haversineKm } from "@/lib/geo";

/**
 * One course, rendered the same way in the feed and in the active-course card.
 * The actions differ, so they come in as children rather than being branched on
 * here.
 *
 * Read on a phone, at a red light: the shop and the landmark are the two things
 * that matter, so they get the size. Everything else is secondary.
 */

function coord(lat: number | null, lng: number | null): string | null {
  return lat == null || lng == null ? null : `${lat},${lng}`;
}

function mapsUrl(lat: number | null, lng: number | null): string | null {
  const q = coord(lat, lng);
  return q
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
    : null;
}

/**
 * One tap for the whole run: shop first, customer second.
 *
 * `origin` is deliberately left out — Maps then uses the phone's live location,
 * which beats the last fix we happened to store, and works even when the driver
 * has refused us the permission.
 *
 * Once the package is in hand the shop is behind them, so it stops being a
 * waypoint: routing a driver back past the restaurant they have just left is
 * the kind of detail that makes an app feel written by someone who has never
 * done the job.
 */
function mapsRouteUrl(order: DriverOrder, viaPickup: boolean): string | null {
  const pickup = coord(order.pickup_lat, order.pickup_lng);
  const dropoff = coord(order.dropoff_lat, order.dropoff_lng);

  const destination = dropoff ?? pickup;
  if (!destination) return null;

  const params = new URLSearchParams({
    api: "1",
    destination,
    travelmode: "driving",
  });
  if (viaPickup && pickup && dropoff) params.set("waypoints", pickup);

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function CourseCard({
  order,
  driverPosition,
  children,
}: {
  order: DriverOrder;
  /** Used to show how far the pickup is; omitted when we have no fix. */
  driverPosition?: LatLng | null;
  children?: React.ReactNode;
}) {
  const t = useTranslations("Dashboard.course");

  const pickupUrl = mapsUrl(order.pickup_lat, order.pickup_lng);
  const dropUrl = mapsUrl(order.dropoff_lat, order.dropoff_lng);

  // Everything before pickup — including a course still up for grabs, where
  // seeing the whole run is how a driver judges whether to take it.
  const viaPickup = order.state !== "picked_up";
  const routeUrl = mapsRouteUrl(order, viaPickup);

  const away =
    driverPosition && order.pickup_lat != null && order.pickup_lng != null
      ? haversineKm(driverPosition, {
          lat: order.pickup_lat,
          lng: order.pickup_lng,
        })
      : null;

  return (
    <article className="flex flex-col gap-3 rounded-[14px] border border-hair bg-white p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="truncate text-[15px] font-semibold text-stone-ink">
            {order.commerce_name ?? t("unknownShop")}
          </h3>
          {order.commerce_addr && (
            <p className="truncate text-[13px] text-stone-muted">
              {order.commerce_addr}
            </p>
          )}
        </div>
        <div className="flex flex-none flex-col items-end gap-0.5">
          {order.fee != null && (
            <span className="text-[15px] font-semibold text-brand">
              {formatDinar(order.fee)}
            </span>
          )}
          {away != null && (
            <span className="text-[12px] text-stone-muted">
              {t("away", { km: away.toFixed(1) })}
            </span>
          )}
        </div>
      </header>

      {order.order_text && (
        <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-stone-ink">
          {order.order_text}
        </p>
      )}

      <dl className="flex flex-col gap-1 text-[13px]">
        {order.repere && (
          <div className="flex gap-2">
            <dt className="flex-none text-stone-muted">{t("landmark")}</dt>
            <dd className="min-w-0 text-stone-ink">{order.repere}</dd>
          </div>
        )}
        {order.distance_km != null && (
          <div className="flex gap-2">
            <dt className="flex-none text-stone-muted">{t("distance")}</dt>
            <dd className="text-stone-ink">
              {order.distance_km.toFixed(1)} km
            </dd>
          </div>
        )}
      </dl>

      {routeUrl && (
        <a
          href={routeUrl}
          target="_blank"
          rel="noreferrer"
          className="flex h-11 items-center justify-center rounded-[10px] border border-brand bg-brand-bg px-3 text-[14px] font-semibold text-brand transition-colors"
        >
          {viaPickup ? t("routeFull") : t("routeToCustomer")}
        </a>
      )}

      <div className="flex flex-wrap gap-2">
        {/* Kept alongside the full route: a driver already outside the shop
            wants the shop alone, not an itinerary starting where they stand. */}
        {viaPickup && pickupUrl && (
          <a
            href={pickupUrl}
            target="_blank"
            rel="noreferrer"
            className="flex h-9 items-center rounded-[8px] border border-hair px-3 text-[13px] font-medium text-stone-ink transition-colors hover:bg-hair-2"
          >
            {t("openPickup")}
          </a>
        )}
        {dropUrl && (
          <a
            href={dropUrl}
            target="_blank"
            rel="noreferrer"
            className="flex h-9 items-center rounded-[8px] border border-hair px-3 text-[13px] font-medium text-stone-ink transition-colors hover:bg-hair-2"
          >
            {t("openDropoff")}
          </a>
        )}
        {order.phone && (
          <a
            href={`tel:+216${order.phone}`}
            className="flex h-9 items-center rounded-[8px] border border-hair px-3 text-[13px] font-medium text-stone-ink transition-colors hover:bg-hair-2"
          >
            {t("callCustomer")}
          </a>
        )}
      </div>

      {children}
    </article>
  );
}
