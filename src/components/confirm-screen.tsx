"use client";

import { useTranslations } from "next-intl";
import { MessageCircle, Plus, X } from "lucide-react";
import { formatDinar } from "@/lib/format";
import { stepState, type OrderStage } from "@/lib/order-types";

type Props = {
  /**
   * Live state, polled by OrderApp for every running course at once — this
   * screen is one view onto that, not a second source of it.
   */
  stage: OrderStage;
  driverName: string | null;
  trackingNumber: string | null;
  brandName?: string;
  courseNumber: number;
  order: string;
  commerceName: string;
  fee: number | null;
  onProblem: () => void;
  /** Back to the form. The course keeps running — see LiveCourses. */
  onNewOrder: () => void;
  onInstall: () => void;
  showPwa: boolean;
  onDismissPwa: () => void;
};

function TimelineDot({ state }: { state: ReturnType<typeof stepState> }) {
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

function labelClass(step: OrderStage, stage: OrderStage): string {
  return stepState(step, stage) !== "pending"
    ? "text-brand"
    : "text-stone-faint";
}

export function ConfirmScreen({
  stage,
  driverName,
  trackingNumber,
  brandName,
  courseNumber,
  order,
  commerceName,
  fee,
  onProblem,
  onNewOrder,
  onInstall,
  showPwa,
  onDismissPwa,
}: Props) {
  const t = useTranslations("Confirm");

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
          {/* This screen is re-openable now, so the headline reports where the
              course is, not the moment it was created: coming back to a driver
              who left ten minutes ago to read "Commande envoyée !" is the app
              telling you something you already knew. */}
          <div className="text-xl font-semibold text-stone-ink">
            {delivered
              ? t("delivered")
              : stage === "enroute"
                ? t("onTheWay")
                : t("sent")}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <div className="rounded-full border border-hair bg-hair-2 px-3 py-1 text-[13px] font-medium text-stone-muted2">
              {/* The message must keep `{number}` bare. Typing it as
                  `{number, number}` would group it into "#1 047" — it is an
                  identifier, not a quantity. */}
              {t("courseNumber", { number: courseNumber })}
            </div>
            {trackingNumber && (
              <div className="rounded-full border border-hair bg-hair-2 px-3 py-1 text-[13px] font-medium text-stone-muted2">
                {t("tracking", { number: trackingNumber })}
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
              <TimelineDot state={stepState("searching", stage)} />
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
              <TimelineDot state={stepState("enroute", stage)} />
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
              <TimelineDot state={stepState("delivered", stage)} />
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

        {/* The way out of this screen. The course keeps running behind it: the
            order screen shows a bar that comes straight back here. */}
        <button
          type="button"
          onClick={onNewOrder}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-[10px] text-[15px] font-medium text-brand transition-colors hover:bg-brand-bg"
        >
          <Plus className="size-5" strokeWidth={1.5} />
          {t("newOrder")}
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
