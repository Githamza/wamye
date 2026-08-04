"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";

type Platform = "ios" | "android";

/**
 * The two brand marks, inline.
 *
 * lucide ships no Android robot, and its `Apple` is the fruit — a driver
 * scanning for "the one that looks like my phone" would not stop on either.
 * Filled with currentColor so the mark dims with the label on the unselected
 * tab instead of sitting there at full strength.
 */
function AppleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

function AndroidMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M17.523 15.341a.999.999 0 1 1 0-1.999.999.999 0 0 1 0 1.999m-11.046 0a.999.999 0 1 1 0-1.999.999.999 0 0 1 0 1.999m11.405-6.02 1.997-3.459a.416.416 0 0 0-.72-.416l-2.022 3.503A12.084 12.084 0 0 0 12 7.851c-1.853 0-3.59.393-5.137 1.099L4.841 5.447a.416.416 0 0 0-.72.416l1.998 3.459C2.689 11.187.343 14.659 0 18.761h24c-.343-4.102-2.689-7.574-6.118-9.44" />
    </svg>
  );
}

/**
 * The walkthrough for each phone, as screenshots of the browser's own menus.
 *
 * iOS file names are NOT the step order: the numbering painted on the
 * screenshots is what a driver follows, and it runs 1 → 5 → 4 → 3 → 2 through
 * the files. Listed explicitly so nobody "fixes" it back into file order.
 *
 * Android is one screen, not five: Chrome puts "Add to Home screen" in the
 * menu every phone already opens by reflex, so the one screenshot showing it
 * is the whole instruction. Splitting out "first tap the ⋮" only added a step
 * with nothing to look at.
 *
 * WebP, sized for this exact slot: the whole thing is ~215 KB instead of the
 * 3.5 MB the originals weighed. It loads on a phone, on mobile data, for a
 * driver who is not yet installed and therefore not yet reachable.
 */
const TUTORIALS: Record<
  Platform,
  { width: number; height: number; shots: string[] }
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
    shots: ["/tuto-add-screen/photo-tuto-android1.webp"],
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
  // Android is a single screen: "Étape 1 sur 1", one lonely dot and a dead
  // Précédent are all answers to a question nobody asked.
  const paged = shots.length > 1;

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
            {paged && (
              <div className="text-[12px] text-stone-muted">
                {t("counter", { step: step + 1, total: shots.length })}
              </div>
            )}
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
              className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[8px] text-[13px] font-medium transition-colors ${
                platform === p
                  ? "bg-white text-stone-ink shadow-[0_1px_2px_rgba(28,25,23,0.12)]"
                  : "text-stone-muted"
              }`}
            >
              {p === "ios" ? (
                <AppleMark className="size-4 flex-none" />
              ) : (
                <AndroidMark className="size-4 flex-none" />
              )}
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

          <div
            className={`flex flex-none items-center justify-center gap-1.5 ${paged ? "" : "hidden"}`}
          >
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
          {paged && (
            <button
              type="button"
              disabled={step === 0}
              onClick={() => setStep(step - 1)}
              className="flex h-11 flex-1 items-center justify-center rounded-[10px] border border-hair text-[14px] font-medium text-stone-muted transition-opacity disabled:opacity-40"
            >
              {t("prev")}
            </button>
          )}
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
