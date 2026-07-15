"use client";

import { Crosshair, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { MiniMap } from "@/components/mini-map";
import { formatDT } from "@/lib/fees";

export type DeliveryStatus = "idle" | "locating" | "ready" | "outzone";

type Props = {
  status: DeliveryStatus;
  fee: number | null;
  distanceKm: number | null;
  /** Driving time, when the fee came from a real road route. */
  durationMin: number | null;
  /** "road" = Routes API; "estimate" = straight-line fallback. */
  quoteSource: "road" | "estimate";
  /** A road-distance quote is in flight — the fee shown is still the estimate. */
  quoting: boolean;
  position: { lat: number; lng: number } | null;
  onPositionChange: (pos: { lat: number; lng: number }) => void;
  repere: string;
  onRepere: (v: string) => void;
  onUseLocation: () => void;
};

function FeeSkeleton() {
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-hair bg-hair-2 px-4 py-3.5">
      <div className="flex justify-between">
        <div className="h-3.5 w-[120px] animate-shimmer rounded-md bg-[linear-gradient(90deg,#E7E5E4_25%,#F5F5F4_50%,#E7E5E4_75%)] bg-[length:600px_100%]" />
        <div className="h-3.5 w-[52px] animate-shimmer rounded-md bg-[linear-gradient(90deg,#E7E5E4_25%,#F5F5F4_50%,#E7E5E4_75%)] bg-[length:600px_100%]" />
      </div>
      <div className="h-[26px] w-[88px] animate-shimmer rounded-md bg-[linear-gradient(90deg,#E7E5E4_25%,#F5F5F4_50%,#E7E5E4_75%)] bg-[length:600px_100%]" />
      <div className="h-[11px] w-[220px] animate-shimmer rounded-md bg-[linear-gradient(90deg,#E7E5E4_25%,#F5F5F4_50%,#E7E5E4_75%)] bg-[length:600px_100%]" />
    </div>
  );
}

export function DeliveryBlock({
  status,
  fee,
  distanceKm,
  durationMin,
  quoteSource,
  quoting,
  position,
  onPositionChange,
  repere,
  onRepere,
  onUseLocation,
}: Props) {
  const located = status === "ready" || status === "outzone";
  const onRoad = quoteSource === "road";

  return (
    <>
      {status === "idle" && (
        <button
          type="button"
          onClick={onUseLocation}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-[10px] border border-hair bg-white text-[15px] font-medium text-brand transition-colors hover:border-brand-border hover:bg-brand-bg"
        >
          <Crosshair className="size-5" strokeWidth={1.5} />
          Utiliser ma position
        </button>
      )}

      {status === "locating" && (
        <>
          <button
            type="button"
            disabled
            className="flex h-12 w-full items-center justify-center gap-2 rounded-[10px] border border-hair bg-white text-[15px] font-medium text-brand opacity-60"
          >
            <Crosshair className="size-5 animate-pulse" strokeWidth={1.5} />
            Localisation…
          </button>
          <FeeSkeleton />
        </>
      )}

      {located && <MiniMap position={position} onPositionChange={onPositionChange} />}

      {located && (
        <Input
          value={repere}
          onChange={(e) => onRepere(e.target.value)}
          placeholder="Ex : maison bleue derrière la pharmacie"
          aria-label="Repère (facultatif)"
          className="h-12 rounded-[10px] text-[15px]"
        />
      )}

      {status === "ready" && fee !== null && (
        <div className="anim-fade-up flex flex-col gap-1 rounded-xl border border-brand-border bg-brand-bg px-4 py-3.5">
          <div className="flex items-baseline justify-between">
            <div className="text-[15px] font-medium text-brand-ink">Frais de livraison</div>
            <div className="flex items-center gap-1.5 text-[13px] text-stone-muted">
              {quoting && <Loader2 className="size-3.5 animate-spin" />}
              {/* Straight-line distances get a "~"; road distances are exact. */}
              {onRoad
                ? `${formatDT(distanceKm ?? 0)} km par la route`
                : `~${formatDT(distanceKm ?? 0)} km`}
              {onRoad && durationMin !== null && ` · ${durationMin} min`}
            </div>
          </div>
          <div className="text-[26px] font-extrabold tracking-[-0.01em] text-amber">
            {formatDT(fee)} DT
          </div>
          <div className="text-xs text-stone-muted">
            {quoting
              ? "Calcul de l'itinéraire…"
              : onRoad
                ? "Prix du repas confirmé par le livreur avant achat"
                : "Estimation — choisissez un commerce pour le tarif exact"}
          </div>
        </div>
      )}

      {status === "outzone" && (
        <div className="anim-fade-up flex flex-col gap-1 rounded-xl border border-danger-border bg-danger-bg px-4 py-3.5">
          <div className="text-[15px] font-semibold text-danger">Hors zone de livraison</div>
          <div className="text-[14px] leading-normal text-danger-ink">
            Désolé, cette adresse est hors de notre zone (Djerba uniquement)
          </div>
        </div>
      )}
    </>
  );
}
