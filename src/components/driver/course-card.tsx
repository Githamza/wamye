"use client";

import { useTranslations } from "next-intl";
import { Navigation, Phone } from "lucide-react";
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

/**
 * A Maps link for one point.
 *
 * With a place id, Maps shows the business — its name, its opening hours, its
 * reviews. Without one it shows "Point sur la carte", which is what a driver
 * was getting for the restaurant they were being sent to.
 *
 * The coordinates stay in the URL either way. The place id only decides the
 * label: letting a text query pick the location is how a pickup once resolved
 * to Tennessee (see the note on CreateOrderInput.commercePosition).
 */
function mapsUrl(
  lat: number | null,
  lng: number | null,
  placeId?: string | null,
): string | null {
  const q = coord(lat, lng);
  if (!q) return null;
  const params = new URLSearchParams({ api: "1", query: q });
  if (placeId) params.set("query_place_id", placeId);
  return `https://www.google.com/maps/search/?${params.toString()}`;
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

  if (viaPickup && pickup && dropoff) {
    params.set("waypoints", pickup);
    // Names the stop after the shop rather than a bare pin. Google requires the
    // text parameter alongside the id, which the coordinates above satisfy.
    if (order.commerce_place_id) {
      params.set("waypoint_place_ids", order.commerce_place_id);
    }
  } else if (!dropoff && order.commerce_place_id) {
    // Degenerate case: no customer pin, so the shop IS the destination.
    params.set("destination_place_id", order.commerce_place_id);
  }

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

  const pickupUrl = mapsUrl(
    order.pickup_lat,
    order.pickup_lng,
    order.commerce_place_id,
  );
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
      {/* The two things a driver decides on, side by side and nothing between
          them: what the run pays, and how far away it starts. */}
      <header className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 flex-1 text-[17px] font-semibold leading-snug text-stone-ink">
          {order.commerce_name ?? t("unknownShop")}
        </h3>
        <div className="flex flex-none flex-col items-end">
          {order.fee != null && (
            <span className="text-[22px] font-semibold leading-none tracking-tight text-brand">
              {formatDinar(order.fee)}
            </span>
          )}
          {away != null && (
            <span className="mt-1 text-[12px] text-stone-muted">
              {t("away", { km: away.toFixed(1) })}
            </span>
          )}
        </div>
      </header>

      {order.order_text && (
        <p className="whitespace-pre-wrap rounded-[10px] bg-hair-2 px-3 py-2.5 text-[14px] leading-relaxed text-stone-ink">
          {order.order_text}
        </p>
      )}

      {/* The run itself, in the order it is driven: shop, then customer. Each
          stop is its own tap target — the three look-alike buttons this
          replaces made the driver read labels to find the map they wanted. */}
      <div className="overflow-hidden rounded-[12px] border border-hair">
        <Stop
          eyebrow={t("stopPickup")}
          title={order.commerce_addr ?? (order.commerce_name ?? t("unknownShop"))}
          href={pickupUrl}
          label={t("openPickup")}
          go={t("goThere")}
          marker={
            <span className="h-2.5 w-2.5 rounded-full bg-brand ring-4 ring-brand-fill" />
          }
        />

        {/* The trip distance belongs between the stops, not in a list of
            figures: it is the length of this line. */}
        <div className="flex items-center gap-3 px-3">
          <span aria-hidden className="flex w-4 flex-none justify-center">
            <span className="h-5 border-l border-dashed border-stone-faint" />
          </span>
          {order.distance_km != null && (
            <span className="text-[11px] font-medium uppercase tracking-wide text-stone-muted">
              {t("trip", { km: order.distance_km.toFixed(1) })}
            </span>
          )}
        </div>

        <Stop
          eyebrow={t("stopDropoff")}
          title={order.customer_name ?? t("stopDropoff")}
          detail={order.repere}
          href={dropUrl}
          label={t("openDropoff")}
          go={t("goThere")}
          marker={
            <span className="h-3 w-3 rounded-full border-[3px] border-brand bg-white" />
          }
        />

        {/* The two things done from the road, on one bar under the stops: drive
            the run, or ring the person waiting at the end of it. */}
        {(routeUrl || order.phone) && (
          <div className="flex border-t border-hair bg-brand-bg">
            {routeUrl && (
              <a
                href={routeUrl}
                target="_blank"
                rel="noreferrer"
                className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 px-3 text-[13px] font-semibold text-brand transition-colors hover:bg-brand-fill focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
              >
                <Navigation className="h-4 w-4 flex-none" aria-hidden />
                <span className="truncate">
                  {viaPickup ? t("routeFull") : t("routeToCustomer")}
                </span>
              </a>
            )}
            {order.phone && (
              <a
                href={`tel:+216${order.phone}`}
                aria-label={t("callCustomer")}
                className={`flex h-11 flex-none items-center justify-center gap-2 px-4 ${routeUrl ? "border-s border-brand-border" : "flex-1"} text-[13px] font-semibold text-brand transition-colors hover:bg-brand-fill focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand`}
              >
                <Phone className="h-4 w-4" aria-hidden />
                {t("call")}
              </a>
            )}
          </div>
        )}
      </div>

      {children}
    </article>
  );
}

/**
 * One stop on the run.
 *
 * The row is the link — a driver reaching for the shop's map at a red light
 * should be able to hit anywhere on the line, not a 13px label. Nothing else
 * is interactive here: a second control on the row would either nest inside
 * that link or push its label out of line with the stop above.
 */
function Stop({
  eyebrow,
  title,
  detail,
  href,
  label,
  go,
  marker,
}: {
  eyebrow: string;
  title: string;
  detail?: string | null;
  href: string | null;
  /** Read out instead of the row's text, which is an address. */
  label: string;
  go: string;
  marker: React.ReactNode;
}) {
  const body = (
    <>
      <span aria-hidden className="flex w-4 flex-none justify-center pt-1">
        {marker}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-stone-muted">
          {eyebrow}
        </span>
        {/* Clamped, not truncated: an address cut at one line on a narrow
            phone loses the street it names. */}
        <span className="block line-clamp-2 text-[14px] text-stone-ink">
          {title}
        </span>
        {detail && (
          <span className="block line-clamp-2 text-[13px] text-stone-muted">
            {detail}
          </span>
        )}
      </span>
    </>
  );

  return (
    <div className="flex items-center px-1">
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          aria-label={label}
          className="flex min-w-0 flex-1 items-start gap-3 rounded-[10px] px-2 py-2.5 transition-colors hover:bg-hair-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
        >
          {body}
          <span className="flex-none pt-1 text-[12px] font-semibold text-brand">
            {go}
          </span>
        </a>
      ) : (
        <div className="flex min-w-0 flex-1 items-start gap-3 px-2 py-2.5">
          {body}
        </div>
      )}
    </div>
  );
}
