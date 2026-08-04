"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";

/**
 * The five screenshots of "Add to Home Screen", in order.
 *
 * The file names are NOT the step order: the numbering painted on the phone
 * screenshots is what a driver follows, and it runs 1 → 5 → 4 → 3 → 2 through
 * the files. Listed explicitly so nobody "fixes" it back into file order.
 *
 * WebP at 620px rather than the original 1320px PNGs: the whole tutorial is
 * 185 KB instead of 3.5 MB, which matters — this loads on a phone, on mobile
 * data, for a driver who is not yet installed and not yet reachable.
 */
const SHOTS = [
  "/tuto-add-screen/photo-tuto1.webp",
  "/tuto-add-screen/photo-tuto5.webp",
  "/tuto-add-screen/photo-tuto4.webp",
  "/tuto-add-screen/photo-tuto3.webp",
  "/tuto-add-screen/photo-tuto2.webp",
] as const;

/** Every shot is the same phone, so one ratio covers the frame. */
const SHOT_RATIO = "1320 / 2868";

export function InstallTutorial({ onClose }: { onClose: () => void }) {
  const t = useTranslations("Dashboard.push.tutorial");
  const [step, setStep] = useState(0);

  const last = step === SHOTS.length - 1;

  // The dashboard keeps scrolling behind a fixed overlay otherwise — on iOS
  // that reads as the modal itself being broken.
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  // Escape closes, for the desktop case; harmless on a phone.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("title")}
      className="anim-fade-in fixed inset-0 z-50 flex flex-col bg-[rgba(28,25,23,0.55)] p-4"
    >
      <div className="mx-auto flex max-h-full w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-white shadow-[0_20px_48px_rgba(28,25,23,0.35)]">
        <div className="flex flex-none items-center justify-between gap-3 border-b border-hair px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold text-stone-ink">
              {t("title")}
            </div>
            <div className="text-[12px] text-stone-muted">
              {t("counter", { step: step + 1, total: SHOTS.length })}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="flex size-9 flex-none items-center justify-center rounded-full text-stone-muted transition-colors hover:bg-hair-2"
          >
            <X className="size-5" strokeWidth={1.75} />
          </button>
        </div>

        {/* The caption sits above the screenshot: it is the instruction, and the
            screenshot is only there to point at where. */}
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          <p className="text-[14px] leading-relaxed text-stone-ink">
            {t(`step${step + 1}` as "step1")}
          </p>

          {/* Advancing by tapping the image is how a phone user expects this to
              work; the buttons below stay for anyone who does not try it. */}
          <button
            type="button"
            onClick={() => (last ? onClose() : setStep(step + 1))}
            className="mx-auto block w-full max-w-[240px] overflow-hidden rounded-[14px] border border-hair bg-hair-2"
            style={{ aspectRatio: SHOT_RATIO }}
          >
            {/* Plain <img>: these are already sized and encoded for this exact
                slot, so next/image would optimize an optimized file — and add a
                runtime sharp dependency the standalone image does not need. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={SHOTS[step]}
              alt={t(`step${step + 1}` as "step1")}
              width={620}
              height={1347}
              // Only the first is above the fold of the modal; the rest arrive
              // as the driver walks through.
              loading={step === 0 ? "eager" : "lazy"}
              className="size-full object-cover object-top"
            />
          </button>

          <div className="flex flex-none items-center justify-center gap-1.5">
            {SHOTS.map((shot, i) => (
              <span
                key={shot}
                className={`size-1.5 rounded-full transition-colors ${
                  i === step ? "bg-brand" : "bg-hair"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-none items-center gap-2 border-t border-hair px-4 py-3">
          <button
            type="button"
            disabled={step === 0}
            onClick={() => setStep(step - 1)}
            className="flex h-11 flex-1 items-center justify-center rounded-[10px] border border-hair text-[14px] font-medium text-stone-muted transition-opacity disabled:opacity-40"
          >
            {t("prev")}
          </button>
          <button
            type="button"
            onClick={() => (last ? onClose() : setStep(step + 1))}
            className="flex h-11 flex-1 items-center justify-center rounded-[10px] bg-brand text-[14px] font-semibold text-white"
          >
            {last ? t("done") : t("next")}
          </button>
        </div>
      </div>
    </div>
  );
}
