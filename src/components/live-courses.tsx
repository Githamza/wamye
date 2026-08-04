"use client";

import { Fragment, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronRight } from "lucide-react";
import { STAGE_ORDER, stepState, type OrderStage } from "@/lib/order-types";
import type { ActiveOrder } from "@/lib/storage";

/** One running course, with whatever the tracking poll last said about it. */
export type LiveCourse = {
  course: ActiveOrder;
  stage: OrderStage;
  driverName: string | null;
};

type Props = {
  /** Running courses, newest first. Settled ones are filtered out upstream. */
  courses: LiveCourse[];
  onOpen: (course: ActiveOrder) => void;
};

/**
 * The confirm screen's timeline, laid on its side.
 *
 * Same three stops, same dots, same pulse on the one that is happening now — so
 * a row here and the screen it opens are visibly the same object, and two
 * deliveries can be compared without reading a word.
 */
function RunRail({ stage }: { stage: OrderStage }) {
  return (
    // Flex order follows the writing direction, so the rail runs right-to-left
    // in Arabic on its own. Decorative: the stage is named in text beside it.
    <span className="flex flex-none items-center" aria-hidden>
      {STAGE_ORDER.map((step, i) => {
        const state = stepState(step, stage);
        return (
          <Fragment key={step}>
            {i > 0 && (
              <span
                className={`h-0.5 w-5 ${
                  state === "pending" ? "bg-brand-border" : "bg-brand"
                }`}
              />
            )}
            <span
              className={`size-2 rounded-full ${
                state === "active"
                  ? "animate-pulse-dot bg-brand"
                  : state === "done"
                    ? "bg-brand"
                    : "bg-brand-border"
              }`}
            />
          </Fragment>
        );
      })}
    </span>
  );
}

const BAR =
  "flex w-full items-center gap-3 px-5 py-3 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand";

/**
 * The way back to a delivery in progress, pinned under the header and outside
 * the scroller: a course cannot be scrolled out of reach while a driver is on
 * the move.
 *
 * One course is shown outright and opens in a single tap — making someone open
 * a list to reach the only thing in it is a tax. Two or more collapse behind a
 * count, since the bar is stealing height from the form either way.
 */
export function LiveCourses({ courses, onOpen }: Props) {
  const t = useTranslations("Courses");
  const tConfirm = useTranslations("Confirm");
  const [expanded, setExpanded] = useState(false);

  if (courses.length === 0) return null;

  function stageLabel({ stage, driverName }: LiveCourse): string {
    if (stage === "enroute") {
      // Its own key rather than the timeline's: that one is a sentence and ends
      // in a full stop, which reads as a typo on a one-line label.
      return driverName
        ? t("enrouteWith", { name: driverName })
        : tConfirm("stageEnroute");
    }
    if (stage === "delivered") return tConfirm("stageDelivered");
    return tConfirm("stageSearching");
  }

  if (courses.length === 1) {
    const only = courses[0];
    return (
      <button
        type="button"
        onClick={() => onOpen(only.course)}
        aria-label={t("follow", { number: only.course.courseNumber })}
        className={`${BAR} anim-fade-in flex-none border-b border-brand-border bg-brand-bg hover:bg-brand-fill`}
      >
        <RunRail stage={only.stage} />
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-brand-ink">
          {/* Both halves stand alone, so the join survives translation. */}
          {[
            tConfirm("courseNumber", { number: only.course.courseNumber }),
            stageLabel(only),
          ].join(" · ")}
        </span>
        <ChevronRight
          className="size-4 flex-none text-brand rtl:rotate-180"
          strokeWidth={2}
        />
      </button>
    );
  }

  return (
    <div className="anim-fade-in flex-none border-b border-brand-border bg-brand-bg">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className={`${BAR} hover:bg-brand-fill`}
      >
        <span className="size-2 flex-none animate-pulse-dot rounded-full bg-brand" />
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-brand-ink">
          {t("running", { count: courses.length })}
        </span>
        <ChevronDown
          className={`size-4 flex-none text-brand transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
          strokeWidth={2}
        />
      </button>

      {expanded && (
        // Capped and scrollable: five courses must not push the form off screen.
        <ul className="max-h-[248px] divide-y divide-hair overflow-y-auto border-t border-brand-border bg-white">
          {courses.map((c) => (
            <li key={c.course.createdAt}>
              <button
                type="button"
                onClick={() => onOpen(c.course)}
                aria-label={t("follow", { number: c.course.courseNumber })}
                className="flex w-full flex-col gap-1.5 px-5 py-3 text-start transition-colors hover:bg-brand-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
              >
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="flex-none text-[15px] font-semibold text-brand-ink">
                    {tConfirm("courseNumber", {
                      number: c.course.courseNumber,
                    })}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-stone-muted2">
                    {c.course.order}
                  </span>
                </span>
                <span className="flex items-center gap-2.5">
                  <RunRail stage={c.stage} />
                  <span className="min-w-0 truncate text-[12px] font-medium text-brand">
                    {stageLabel(c)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
