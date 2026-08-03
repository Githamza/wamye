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

function mapsUrl(lat: number | null, lng: number | null): string | null {
  if (lat == null || lng == null) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
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

      <div className="flex flex-wrap gap-2">
        {pickupUrl && (
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
