"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { MessageCircle, X } from "lucide-react";
import { formatDinar } from "@/lib/format";
import type { OrderStage, TrackedOrder } from "@/lib/order-types";

type Props = {
  /**
   * The per-order capability returned by POST /api/orders. It is what the
   * tracking poll authenticates with — there is no id to enumerate.
   */
  trackingToken?: string | null;
  brandName?: string;
  courseNumber: number;
  order: string;
  commerceName: string;
  fee: number | null;
  onProblem: () => void;
  onInstall: () => void;
  showPwa: boolean;
  onDismissPwa: () => void;
};

type DotState = "done" | "active" | "pending";

function TimelineDot({ state }: { state: DotState }) {
  return (
    <span
      className={`mt-1 size-3 rounded-full ${
        state === "active"
          ? "animate-pulse-dot bg-brand"
          : state === "done"
            ? "bg-brand"
            : "bg-hair"
      }`}
    />
  );
}

// Ordered stages → index, so we can tell past/current/future steps apart.
const ORDER: OrderStage[] = ["searching", "enroute", "delivered"];

function dotFor(step: OrderStage, stage: OrderStage): DotState {
  if (stage === "canceled") return step === "searching" ? "active" : "pending";
  const cur = ORDER.indexOf(stage);
  const at = ORDER.indexOf(step);
  if (at < cur) return "done";
  if (at === cur) return stage === "delivered" ? "done" : "active";
  return "pending";
}

function labelClass(step: OrderStage, stage: OrderStage): string {
  const active = dotFor(step, stage) !== "pending";
  return active ? "text-brand" : "text-stone-faint";
}

export function ConfirmScreen({
  trackingToken,
  brandName,
  courseNumber,
  order,
  commerceName,
  fee,
  onProblem,
  onInstall,
  showPwa,
  onDismissPwa,
}: Props) {
  const t = useTranslations("Confirm");
  // Start optimistic; live polling refines this once the order exists.
  const [stage, setStage] = useState<OrderStage>("searching");
  const [tracking, setTracking] = useState<string | null>(null);
  const [driverName, setDriverName] = useState<string | null>(null);
  // Read by the polling loop to decide the next delay and when to stop. Kept in
  // sync from an effect, not during render.
  const stageRef = useRef(stage);
  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  useEffect(() => {
    if (!trackingToken) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      try {
        const res = await fetch(`/api/track/${trackingToken}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data = (await res.json()) as TrackedOrder;
          if (cancelled) return;
          setStage(data.stage);
          setDriverName(data.driverName);
          if (data.trackingNumber) setTracking(data.trackingNumber);
        }
      } catch {
        /* transient — keep the last known stage */
      }

      if (cancelled) return;
      const s = stageRef.current;
      // Stop only when the order is actually finished. The old code gave up
      // after 40 attempts — about five minutes — so the customer's timeline
      // froze *before* the delivery it was meant to show. A course can sit
      // waiting for twenty minutes at three in the morning.
      if (s === "delivered" || s === "canceled") return;
      // Slower once a driver is on the way: the interesting change has happened.
      timer = setTimeout(poll, s === "enroute" ? 15_000 : 8_000);
    }

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [trackingToken]);

  const delivered = stage === "delivered";
  const canceled = stage === "canceled";

  return (
    <>
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4 pt-6">
        {/* success hero */}
        <div className="flex flex-col items-center gap-2.5 px-0 pb-1 pt-2">
          <svg
            width="72"
            height="72"
            viewBox="0 0 72 72"
            className="anim-pop-in"
          >
            <circle
              cx="36"
              cy="36"
              r="32"
              fill="#F0FDF4"
              stroke="#16A34A"
              strokeWidth="3"
              strokeDasharray="202"
              strokeDashoffset="202"
              className="draw-stroke"
            />
            <path
              d="M23 37.5l9.5 9.5L49 27"
              fill="none"
              stroke="#16A34A"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="40"
              strokeDashoffset="40"
              className="draw-check"
            />
          </svg>
          <div className="text-xl font-semibold text-stone-ink">
            {delivered ? t("delivered") : t("sent")}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <div className="rounded-full border border-hair bg-hair-2 px-3 py-1 text-[13px] font-medium text-stone-muted2">
              {/* The message must keep `{number}` bare. Typing it as
                  `{number, number}` would group it into "#1 047" — it is an
                  identifier, not a quantity. */}
              {t("courseNumber", { number: courseNumber })}
            </div>
            {tracking && (
              <div className="rounded-full border border-hair bg-hair-2 px-3 py-1 text-[13px] font-medium text-stone-muted2">
                {t("tracking", { number: tracking })}
              </div>
            )}
          </div>
        </div>

        {canceled && (
          <div className="rounded-[14px] border border-danger-border bg-danger-bg px-4 py-3.5 text-[14px] leading-normal text-danger-ink">
            {t("canceled")}
          </div>
        )}

        {/* timeline */}
        <div className="flex flex-col rounded-[14px] border border-hair bg-white px-4 py-[18px] shadow-[0_1px_2px_rgba(28,25,23,0.04)]">
          <div className="flex gap-3.5">
            <div className="flex w-4 flex-col items-center">
              <TimelineDot state={dotFor("searching", stage)} />
              <span className="mt-1 w-0.5 flex-1 bg-hair" />
            </div>
            <div className="flex flex-col gap-px pb-[22px]">
              <div
                className={`text-[15px] font-semibold ${labelClass("searching", stage)}`}
              >
                {t("stageSearching")}
              </div>
              <div className="text-[13px] text-stone-muted">
                {t("stageSearchingHint")}
              </div>
            </div>
          </div>
          <div className="flex gap-3.5">
            <div className="flex w-4 flex-col items-center">
              <TimelineDot state={dotFor("enroute", stage)} />
              <span className="mt-1 w-0.5 flex-1 bg-hair" />
            </div>
            <div className="flex flex-col gap-px pb-[22px]">
              <div
                className={`text-[15px] font-medium ${labelClass("enroute", stage)}`}
              >
                {t("stageEnroute")}
              </div>
              {/* Who is actually coming. First name only — the tracking link is
                  shareable, a driver's full identity should not be. */}
              {driverName && stage === "enroute" && (
                <div className="text-[13px] text-stone-muted">
                  {t("driverOnWay", { name: driverName })}
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-3.5">
            <div className="flex w-4 flex-col items-center">
              <TimelineDot state={dotFor("delivered", stage)} />
            </div>
            <div
              className={`text-[15px] font-medium ${labelClass("delivered", stage)}`}
            >
              {t("stageDelivered")}
            </div>
          </div>
        </div>

        {/* recap */}
        <div className="flex flex-col gap-2 rounded-[14px] border border-hair bg-app px-4 py-4">
          <div className="text-[15px] leading-normal text-stone-ink">
            {order}
          </div>
          <div className="text-[14px] text-stone-muted">{commerceName}</div>
          {fee !== null && (
            <div className="text-[14px] text-stone-muted">
              {t("recapFee")}{" "}
              <span className="font-semibold text-amber">
                {formatDinar(fee)}
              </span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onProblem}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-[10px] border border-hair bg-white text-[15px] font-medium text-stone-ink transition-colors hover:border-brand-border hover:bg-brand-bg"
        >
          <MessageCircle className="size-5 text-brand" strokeWidth={1.5} />
          {t("problem")}
        </button>
      </div>

      {showPwa && (
        <div className="anim-fade-up flex flex-none items-center gap-3 border-t border-brand-border bg-brand-bg px-4 pb-[calc(24px+env(safe-area-inset-bottom,0px))] pt-3.5">
          <div className="flex-1 text-[13px] leading-snug text-brand-ink">
            {t("pwaPrompt", { name: brandName ?? t("pwaFallbackName") })}
          </div>
          <button
            type="button"
            onClick={onInstall}
            className="h-10 flex-none rounded-[10px] bg-brand px-4 text-[14px] font-semibold text-white transition-colors hover:bg-brand-hover"
          >
            {t("pwaAdd")}
          </button>
          <button
            type="button"
            onClick={onDismissPwa}
            aria-label={t("pwaDismiss")}
            className="flex size-8 flex-none items-center justify-center rounded-lg text-stone-muted transition-colors hover:bg-brand-fill"
          >
            <X className="size-4" strokeWidth={1.5} />
          </button>
        </div>
      )}
    </>
  );
}
