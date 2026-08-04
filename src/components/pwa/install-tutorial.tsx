"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";

type Platform = "ios" | "android";

/**
 * The walkthrough for each phone, as screenshots of the browser's own menus.
 *
 * iOS file names are NOT the step order: the numbering painted on the
 * screenshots is what a driver follows, and it runs 1 → 5 → 4 → 3 → 2 through
 * the files. Listed explicitly so nobody "fixes" it back into file order.
 *
 * `src: null` is a step we have no screenshot for — on Android the first tap
 * happens before anything worth photographing. The caption stands alone rather
 * than being illustrated by the wrong picture.
 *
 * WebP, sized for this exact slot: the whole thing is ~215 KB instead of the
 * 3.5 MB the originals weighed. It loads on a phone, on mobile data, for a
 * driver who is not yet installed and therefore not yet reachable.
 */
const TUTORIALS: Record<
  Platform,
  { width: number; height: number; shots: (string | null)[] }
> = {
  ios: {
    width: 620,
    height: 1347,
    shots: [
      "/tuto-add-screen/photo-tuto1.webp",
      "/tuto-add-screen/photo-tuto5.webp",
      "/tuto-add-screen/photo-tuto4.webp",
      "/tuto-add-screen/photo-tuto3.webp",
      "/tuto-add-screen/photo-tuto2.webp",
    ],
  },
  android: {
    width: 395,
    height: 776,
    shots: [null, "/tuto-add-screen/photo-tuto-android1.webp"],
  },
};

export function InstallTutorial({
  initialPlatform,
  onClose,
}: {
  initialPlatform: Platform;
  onClose: () => void;
}) {
  const t = useTranslations("Dashboard.push.tutorial");
  // Opens on the phone the driver is holding; the tab is there for when we
  // guessed wrong, and for a driver helping a colleague on the other phone.
  const [platform, setPlatform] = useState<Platform>(initialPlatform);
  const [step, setStep] = useState(0);

  const { shots, width, height } = TUTORIALS[platform];
  const shot = shots[step];
  const last = step === shots.length - 1;
  const caption = t(`${platform}.step${step + 1}` as "ios.step1");

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

  function choose(next: Platform) {
    setPlatform(next);
    // The two walkthroughs have different lengths and nothing in common, so
    // staying on step 4 of the other one would land anywhere or nowhere.
    setStep(0);
  }

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
              {t("counter", { step: step + 1, total: shots.length })}
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

        {/* Which phone, before anything else: a driver reading Chrome's menu on
            an iPhone walkthrough gives up rather than switching tab. */}
        <div
          role="tablist"
          aria-label={t("platform")}
          className="flex flex-none gap-1 border-b border-hair bg-hair-2 p-1"
        >
          {(["ios", "android"] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={platform === p}
              onClick={() => choose(p)}
              className={`h-9 flex-1 rounded-[8px] text-[13px] font-medium transition-colors ${
                platform === p
                  ? "bg-white text-stone-ink shadow-[0_1px_2px_rgba(28,25,23,0.12)]"
                  : "text-stone-muted"
              }`}
            >
              {/* Not t(p): "android" is also the key of the step group. */}
              {t(p === "ios" ? "tabIos" : "tabAndroid")}
            </button>
          ))}
        </div>

        {/* The caption sits above the screenshot: it is the instruction, and the
            screenshot is only there to point at where. */}
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          <p className="text-[14px] leading-relaxed text-stone-ink">{caption}</p>

          {/* Advancing by tapping the image is how a phone user expects this to
              work; the buttons below stay for anyone who does not try it. */}
          {shot && (
            <button
              type="button"
              onClick={() => (last ? onClose() : setStep(step + 1))}
              className="mx-auto block w-full max-w-[240px] overflow-hidden rounded-[14px] border border-hair bg-hair-2"
              style={{ aspectRatio: `${width} / ${height}` }}
            >
              {/* Plain <img>: these are already sized and encoded for this exact
                  slot, so next/image would optimize an optimized file — and add
                  a runtime sharp dependency the standalone image does not need. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={shot}
                alt={caption}
                width={width}
                height={height}
                // Only the first is above the fold of the modal; the rest arrive
                // as the driver walks through.
                loading={step === 0 ? "eager" : "lazy"}
                className="size-full object-cover object-top"
              />
            </button>
          )}

          <div className="flex flex-none items-center justify-center gap-1.5">
            {shots.map((_, i) => (
              <span
                key={i}
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
