"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/browser";
import { haversineKm } from "@/lib/geo";
import { useForegroundPosition } from "@/lib/hooks/use-foreground-position";
import { isOrderState, isTerminal, type OrderState } from "@/lib/order-status";
import type { DriverOrder } from "@/lib/order-types";
import {
  acceptCourse,
  cancelCourse,
  declineCourse,
  markDelivered,
  markPickedUp,
  type CourseResult,
} from "@/lib/actions/courses";
import { CourseCard } from "./course-card";
import { ProofCapture } from "./proof-capture";
import { DeclineSheet } from "./decline-sheet";

/**
 * The driver's home: the course they are on, then the ones they can take.
 *
 * Seeded from the server so the first paint is real, then kept live by Realtime
 * on `orders` scoped to the tenant. RLS (orders_select_tenant) applies to the
 * channel too, so a forged filter still returns nothing from another tenant.
 */

type Props = {
  tenantId: string;
  profileId: string;
  dispatchRadiusKm: number;
  initialActive: DriverOrder | null;
  initialPending: DriverOrder[];
};

export function DriverBoard({
  tenantId,
  profileId,
  dispatchRadiusKm,
  initialActive,
  initialPending,
}: Props) {
  const t = useTranslations("Dashboard.course");
  const router = useRouter();
  const [pending, setPending] = useState<DriverOrder[]>(initialPending);
  const [active, setActive] = useState<DriverOrder | null>(initialActive);
  const [showAll, setShowAll] = useState(false);
  const [proofPath, setProofPath] = useState<string | null>(null);
  /** Which card has its reason picker open, if any. */
  const [decliningId, setDecliningId] = useState<string | null>(null);
  /**
   * Courses declined in this session. The server already excludes them from
   * feed_courses(), but a Realtime UPDATE on one would otherwise walk it right
   * back into the feed before the next server read.
   */
  const declinedRef = useRef<Set<string>>(new Set());
  const [busy, startTransition] = useTransition();

  const { position, denied, sharing } = useForegroundPosition(
    active?.id ?? null,
  );

  /**
   * Adopt what the server just sent.
   *
   * useState only reads its argument on the first render, so without this the
   * whole resync path was inert: router.refresh() re-ran the query, the props
   * changed, and the component kept rendering its mount-time snapshot. The
   * server read is authoritative — it is also how a driver catches up on
   * everything the socket missed while the phone was asleep.
   *
   * Keyed on the id list rather than array identity, which changes on every
   * parent render.
   */
  const serverKey =
    initialPending.map((o) => `${o.id}:${o.state}`).join(",") +
    "|" +
    (initialActive ? `${initialActive.id}:${initialActive.state}` : "");

  // Adjusted during render, not in an effect: this is React's documented way to
  // reset state when props change, and it avoids the extra render pass an
  // effect would cost. Keyed on the id/state signature, since the arrays get a
  // new identity on every parent render.
  const [lastServerKey, setLastServerKey] = useState(serverKey);
  if (lastServerKey !== serverKey) {
    setLastServerKey(serverKey);
    setPending(initialPending);
    setActive(initialActive);
  }

  // ---- Realtime ------------------------------------------------------------
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    let retries = 0;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    // The socket must carry the user's JWT before it subscribes. With the
    // cookie-based ssr client the session is resolved asynchronously, so
    // subscribing straight away opens an anonymous socket — it reports
    // SUBSCRIBED, then RLS filters every event and the feed silently never
    // updates. Diagnosed exactly that way on 2026-08-03.
    async function connect() {
      if (cancelled) return;
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      // Re-read on every attempt: a token that expired is a plausible cause of
      // the CHANNEL_ERROR this retries, and a stale one would just fail again.
      const token = data.session?.access_token;
      if (token) await supabase.realtime.setAuth(token);

      // A distinct topic per attempt. Reusing the same name means the retry
      // races the channel it is replacing inside supabase-js, which froze the
      // renderer outright when the reconnect fired.
      attempt += 1;
      channel = supabase
        .channel(`orders:${tenantId}:${attempt}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "orders",
            filter: `tenant_id=eq.${tenantId}`,
          },
          (payload) => {
            const row = payload.new as DriverOrder | undefined;
            if (!row?.id || !isOrderState(row.state)) return;

            // Mine, and still running → it is the active course.
            if (row.driver_id === profileId && !isTerminal(row.state))
              setActive(row);
            else if (row.driver_id === profileId) setActive(null);

            setPending((cur) => {
              const without = cur.filter((o) => o.id !== row.id);
              // Realtime `filter` only supports eq, so the state test lives
              // here — as does the decline check: any UPDATE on a course I
              // turned down would otherwise put it straight back in my feed.
              if (row.state !== "pending" || declinedRef.current.has(row.id)) {
                return without;
              }
              return [row, ...without];
            });
          },
        )
        .subscribe((status, err) => {
          if (process.env.NODE_ENV !== "production") {
            console.log("[driver-feed] channel", status, err ?? "");
          }
          if (status === "SUBSCRIBED") {
            // Only after a reconnect, to catch up on what the dead socket
            // missed. NOT on the first subscribe: that fires during mount and
            // Next throws "Router action dispatched before initialization",
            // which takes the whole client tree down with it.
            if (retries > 0) router.refresh();
            retries = 0;
            return;
          }
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            // Reproducible at roughly two minutes on this Supabase project, so
            // reconnecting is not defensive padding — without it a driver's
            // feed silently stops updating and they miss paid work.
            if (cancelled || retries >= 6 || retryTimer) return;
            const dying = channel;
            channel = null;
            const delay = Math.min(30_000, 1000 * 2 ** retries);
            retries += 1;
            retryTimer = setTimeout(() => {
              retryTimer = null;
              if (cancelled) return;
              // Detached outside the callback that reported the failure:
              // removing a channel from inside its own subscribe handler
              // re-enters supabase-js and hung the renderer.
              if (dying) void supabase.removeChannel(dying);
              void connect();
            }, delay);
          }
        });
    }

    void connect();

    /**
     * Coming back to the app is the moment that matters.
     *
     * Chrome throttles timers in a backgrounded tab, so the socket's heartbeat
     * stops; Supabase Realtime then logs "no connected users" and terminates
     * the tenant connection, and the client gets CHANNEL_ERROR. Confirmed in
     * the project's realtime logs on 2026-08-03 — it is expected behaviour, not
     * a fault, and it will happen to every driver whose screen goes off.
     *
     * So on foreground: refresh the feed, and rebuild the channel if it died.
     */
    function onVisible() {
      if (document.visibilityState !== "visible" || cancelled) return;
      router.refresh();
      if (!channel && !retryTimer) {
        retries = 0;
        void connect();
      }
    }
    document.addEventListener("visibilitychange", onVisible);

    // Belt and braces: a websocket can also die quietly with the tab in view.
    const resync = setInterval(() => router.refresh(), 60_000);

    return () => {
      cancelled = true;
      clearInterval(resync);
      document.removeEventListener("visibilitychange", onVisible);
      if (retryTimer) clearTimeout(retryTimer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [tenantId, profileId, router]);

  // ---- Radius filter -------------------------------------------------------
  // In the browser rather than in SQL: the row set is tiny, and it means the
  // radius re-applies as the driver moves without a roundtrip.
  const nearby = useMemo(() => {
    if (!position) return pending; // no fix → show everything rather than nothing
    return pending.filter((o) => {
      if (o.pickup_lat == null || o.pickup_lng == null) return true;
      return (
        haversineKm(position, { lat: o.pickup_lat, lng: o.pickup_lng }) <=
        dispatchRadiusKm
      );
    });
  }, [pending, position, dispatchRadiusKm]);

  const hidden = pending.length - nearby.length;
  const visible = showAll ? pending : nearby;

  // ---- Actions -------------------------------------------------------------
  const run = useCallback(
    (fn: () => Promise<CourseResult>) => {
      startTransition(async () => {
        const res = await fn();
        if (res.ok) {
          router.refresh();
          return;
        }
        // Losing the race is normal, not an error.
        toast(
          t(
            res.code === "already-taken"
              ? "takenByOther"
              : res.code === "reason-missing"
                ? "reasonMissing"
                : "actionFailed",
          ),
        );
        router.refresh();
      });
    },
    [router, t],
  );

  const step: OrderState | null =
    active?.state === "accepted"
      ? "picked_up"
      : active?.state === "picked_up"
        ? "delivered"
        : null;

  return (
    <div className="flex flex-col gap-4">
      {/* ---- Active course ---- */}
      {active && (
        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-[13px] font-semibold uppercase tracking-wide text-stone-muted">
            {t("mine")}
          </h2>
          <CourseCard order={active} driverPosition={position}>
            <div className="flex flex-col gap-2 border-t border-hair pt-3">
              {active.state === "picked_up" && (
                <ProofCapture
                  tenantId={tenantId}
                  orderId={active.id}
                  onCaptured={setProofPath}
                />
              )}
              <button
                type="button"
                disabled={busy || !step}
                onClick={() =>
                  run(() =>
                    step === "picked_up"
                      ? markPickedUp(active.id)
                      : markDelivered(active.id, proofPath),
                  )
                }
                className="flex h-12 items-center justify-center rounded-[10px] bg-brand text-[15px] font-semibold text-white transition-opacity disabled:opacity-60"
              >
                {step === "picked_up" ? t("markPickedUp") : t("markDelivered")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => cancelCourse(active.id))}
                className="flex h-9 items-center justify-center rounded-[8px] border border-hair text-[13px] font-medium text-stone-muted transition-colors hover:bg-hair-2 disabled:opacity-60"
              >
                {t("giveUp")}
              </button>
            </div>
          </CourseCard>

          {/* Honest about what the app can and cannot do. */}
          <p className="px-1 text-[12px] text-stone-muted">
            {denied
              ? t("gpsDenied")
              : sharing
                ? t("gpsSharing")
                : t("gpsWaiting")}
          </p>
        </section>
      )}

      {/* ---- Available courses ---- */}
      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-[13px] font-semibold uppercase tracking-wide text-stone-muted">
          {t("available", { count: visible.length })}
        </h2>

        {visible.length === 0 && (
          <p className="rounded-[14px] border border-dashed border-hair px-4 py-8 text-center text-[14px] text-stone-muted">
            {t("empty")}
          </p>
        )}

        {visible.map((order) => (
          <CourseCard key={order.id} order={order} driverPosition={position}>
            {decliningId === order.id ? (
              <DeclineSheet
                busy={busy}
                onCancel={() => setDecliningId(null)}
                onConfirm={(reason, note) => {
                  setDecliningId(null);
                  // Optimistic: the card goes now. The course is not cancelled,
                  // it simply leaves this driver's feed, so there is nothing to
                  // undo if the write loses a race.
                  declinedRef.current.add(order.id);
                  setPending((cur) => cur.filter((o) => o.id !== order.id));
                  run(() => declineCourse(order.id, reason, note));
                }}
              />
            ) : (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  disabled={busy || active !== null}
                  onClick={() => run(() => acceptCourse(order.id))}
                  className="flex h-12 items-center justify-center rounded-[10px] bg-brand text-[15px] font-semibold text-white transition-opacity disabled:opacity-60"
                >
                  {active ? t("finishFirst") : t("accept")}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setDecliningId(order.id)}
                  className="flex h-10 items-center justify-center rounded-[8px] border border-hair text-[13px] font-medium text-stone-muted transition-colors hover:bg-hair-2 disabled:opacity-60"
                >
                  {t("decline")}
                </button>
              </div>
            )}
          </CourseCard>
        ))}

        {/* Out of radius: shown behind a toggle, never silently dropped — a
            driver who sees nothing assumes the app is broken. */}
        {hidden > 0 && !showAll && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="text-[13px] font-medium text-brand underline underline-offset-2"
          >
            {t("showAll", { count: hidden })}
          </button>
        )}
      </section>
    </div>
  );
}
