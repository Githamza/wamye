"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { formatDT } from "@/lib/fees";
import type { OrderStage, OrderStatus } from "@/lib/order-types";

type Props = {
  orderId?: string | null;
  /** Tenant slug — carried on status polls so the server uses the right company. */
  slug: string;
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
  orderId,
  slug,
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
  // Start optimistic; live polling refines this once the order exists.
  const [stage, setStage] = useState<OrderStage>("searching");
  const [tracking, setTracking] = useState<string | null>(null);
  const stageRef = useRef(stage);
  stageRef.current = stage;

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    let attempts = 0;

    async function poll() {
      attempts += 1;
      try {
        const res = await fetch(
          `/api/orders/${orderId}?slug=${encodeURIComponent(slug)}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = (await res.json()) as OrderStatus;
        if (cancelled) return;
        setStage(data.stage);
        if (data.trackingNumber) setTracking(data.trackingNumber);
      } catch {
        /* transient — keep last known stage */
      }
    }

    poll();
    const timer = setInterval(() => {
      // Stop once delivered/canceled, or after ~5 min of polling.
      if (
        cancelled ||
        stageRef.current === "delivered" ||
        stageRef.current === "canceled" ||
        attempts > 40
      ) {
        clearInterval(timer);
        return;
      }
      poll();
    }, 8000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [orderId, slug]);

  const delivered = stage === "delivered";
  const canceled = stage === "canceled";

  return (
    <>
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4 pt-6">
        {/* success hero */}
        <div className="flex flex-col items-center gap-2.5 px-0 pb-1 pt-2">
          <svg width="72" height="72" viewBox="0 0 72 72" className="anim-pop-in">
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
            {delivered ? "Commande livrée !" : "Commande envoyée !"}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <div className="rounded-full border border-hair bg-hair-2 px-3 py-1 text-[13px] font-medium text-stone-muted2">
              Course #{courseNumber}
            </div>
            {tracking && (
              <div className="rounded-full border border-hair bg-hair-2 px-3 py-1 text-[13px] font-medium text-stone-muted2">
                Suivi {tracking}
              </div>
            )}
          </div>
        </div>

        {canceled && (
          <div className="rounded-[14px] border border-danger-border bg-danger-bg px-4 py-3.5 text-[14px] leading-normal text-danger-ink">
            Cette commande a été annulée. Écrivez-nous si besoin.
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
              <div className={`text-[15px] font-semibold ${labelClass("searching", stage)}`}>
                Recherche d&apos;un livreur
              </div>
              <div className="text-[13px] text-stone-muted">
                Quelques minutes, on vous tient au courant
              </div>
            </div>
          </div>
          <div className="flex gap-3.5">
            <div className="flex w-4 flex-col items-center">
              <TimelineDot state={dotFor("enroute", stage)} />
              <span className="mt-1 w-0.5 flex-1 bg-hair" />
            </div>
            <div
              className={`pb-[22px] text-[15px] font-medium ${labelClass("enroute", stage)}`}
            >
              Livreur en route
            </div>
          </div>
          <div className="flex gap-3.5">
            <div className="flex w-4 flex-col items-center">
              <TimelineDot state={dotFor("delivered", stage)} />
            </div>
            <div className={`text-[15px] font-medium ${labelClass("delivered", stage)}`}>
              Livré
            </div>
          </div>
        </div>

        {/* recap */}
        <div className="flex flex-col gap-2 rounded-[14px] border border-hair bg-app px-4 py-4">
          <div className="text-[15px] leading-normal text-stone-ink">{order}</div>
          <div className="text-[14px] text-stone-muted">{commerceName}</div>
          {fee !== null && (
            <div className="text-[14px] text-stone-muted">
              Frais : <span className="font-semibold text-amber">{formatDT(fee)} DT</span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onProblem}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-[10px] border border-hair bg-white text-[15px] font-medium text-stone-ink transition-colors hover:border-brand-border hover:bg-brand-bg"
        >
          <MessageCircle className="size-5 text-brand" strokeWidth={1.5} />
          Un problème ? Écrivez-nous
        </button>
      </div>

      {showPwa && (
        <div className="anim-fade-up flex flex-none items-center gap-3 border-t border-brand-border bg-brand-bg px-4 pb-[calc(24px+env(safe-area-inset-bottom,0px))] pt-3.5">
          <div className="flex-1 text-[13px] leading-snug text-brand-ink">
            Ajoutez {brandName ?? "cette app"} à votre écran d&apos;accueil pour recommander en 2 taps
          </div>
          <button
            type="button"
            onClick={onInstall}
            className="h-10 flex-none rounded-[10px] bg-brand px-4 text-[14px] font-semibold text-white transition-colors hover:bg-brand-hover"
          >
            Ajouter
          </button>
          <button
            type="button"
            onClick={onDismissPwa}
            aria-label="Fermer"
            className="flex size-8 flex-none items-center justify-center rounded-lg text-stone-muted transition-colors hover:bg-brand-fill"
          >
            <X className="size-4" strokeWidth={1.5} />
          </button>
        </div>
      )}
    </>
  );
}
