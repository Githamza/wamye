"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Map as MapIcon, X } from "lucide-react";
import { useTeamPresence } from "@/lib/hooks/use-team-presence";
import type { CrewMember } from "@/lib/crew";
import { CourseCard } from "@/components/driver/course-card";
import { DriverAvatar } from "./driver-avatar";
import { CrewMap } from "./crew-map";

/**
 * The team roster: who is out, who is free, and what the busy ones are on.
 *
 * Seeded from the server and refreshed on a timer rather than over Realtime:
 * positions land at most every 15 seconds and nobody is watching this screen
 * for a live trace — the map is a "where is everyone", not a chase view.
 * Presence is the exception, since only the socket knows it.
 */

/** Slow enough to be free, quick enough that a course change is not news. */
const REFRESH_MS = 20_000;

export function CrewList({
  crew,
  tenantId,
  profileId,
}: {
  crew: CrewMember[];
  tenantId: string;
  profileId: string;
}) {
  const t = useTranslations("Dashboard.crew");
  const router = useRouter();
  const online = useTeamPresence(tenantId, profileId);
  const [openId, setOpenId] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), REFRESH_MS);
    function onVisible() {
      if (document.visibilityState === "visible") router.refresh();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  const open = crew.find((m) => m.id === openId) ?? null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-stone-muted">
          {t("rosterTitle", { count: crew.length })}
        </h2>
        <button
          type="button"
          onClick={() => setMapOpen(true)}
          aria-label={t("openMap")}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-hair bg-white text-stone-muted transition-colors hover:bg-hair-2 hover:text-stone-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <MapIcon className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <ul className="flex flex-col gap-2">
        {crew.map((member) => (
          <li key={member.id}>
            <Row
              member={member}
              online={online.has(member.id)}
              onOpen={member.order ? () => setOpenId(member.id) : undefined}
            />
          </li>
        ))}
      </ul>

      {open?.order && (
        <Popin title={open.name ?? t("unnamed")} onClose={() => setOpenId(null)}>
          {/* The same card the driver on it is looking at, minus every action:
              this is someone else's course. */}
          <CourseCard order={open.order} />
        </Popin>
      )}

      {mapOpen && (
        <Popin title={t("mapTitle")} onClose={() => setMapOpen(false)} full>
          <CrewMap crew={crew} />
        </Popin>
      )}
    </div>
  );
}

/** One teammate. Tappable only when there is something to open. */
function Row({
  member,
  online,
  onOpen,
}: {
  member: CrewMember;
  online: boolean;
  onOpen?: () => void;
}) {
  const t = useTranslations("Dashboard.crew");

  const state = member.order
    ? t("delivering", { shop: member.order.commerce_name ?? t("someShop") })
    : online
      ? t("available")
      : t("offline");

  // Said plainly rather than left to the grey disc alone: "we last saw them
  // 40 minutes ago" is the difference between an idle driver and an absent one.
  const position = member.positionFresh
    ? null
    : member.positionAgeMin == null
      ? t("positionNever")
      : t("positionStale", { min: member.positionAgeMin });

  const body = (
    <>
      <DriverAvatar member={member} online={online} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[15px] font-medium text-stone-ink">
            {member.name ?? t("unnamed")}
          </span>
          {member.isMe && (
            <span className="flex-none rounded-full bg-hair-2 px-2 py-0.5 text-[11px] font-medium text-stone-muted">
              {t("me")}
            </span>
          )}
        </span>
        <span
          className={`block truncate text-[13px] ${member.order ? "text-brand" : "text-stone-muted"}`}
        >
          {state}
        </span>
        {position && (
          <span className="block text-[12px] text-stone-faint">{position}</span>
        )}
      </span>
    </>
  );

  if (!onOpen) {
    return (
      <div className="flex items-center gap-3 rounded-[14px] border border-hair bg-white px-4 py-3">
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-[14px] border border-hair bg-white px-4 py-3 text-start transition-colors hover:bg-hair-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
    >
      {body}
      <span aria-hidden className="flex-none text-[13px] font-semibold text-brand">
        {t("detail")}
      </span>
    </button>
  );
}

/**
 * A sheet from the bottom, which is where a thumb is. Escape closes it, the
 * backdrop closes it, and the page behind stops scrolling while it is up.
 */
function Popin({
  title,
  onClose,
  full = false,
  children,
}: {
  title: string;
  onClose: () => void;
  /** The map needs the whole height; a course detail does not. */
  full?: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations("Dashboard.crew");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={onClose}
        className="anim-fade-in absolute inset-0 bg-stone-ink/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`anim-fade-up relative flex flex-col overflow-hidden rounded-t-[18px] bg-white ${
          full ? "h-[85dvh]" : "max-h-[85dvh]"
        }`}
      >
        <div className="flex flex-none items-center justify-between border-b border-hair px-4 py-3">
          <span className="truncate text-[15px] font-semibold text-stone-ink">
            {title}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-stone-muted transition-colors hover:bg-hair-2"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className={`flex min-h-0 flex-1 flex-col ${full ? "" : "overflow-y-auto p-4"}`}>
          {children}
        </div>
      </div>
    </div>
  );
}
