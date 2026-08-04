"use client";

import { avatarTint, initials, type CrewMember } from "@/lib/crew";

/**
 * One teammate, as a disc.
 *
 * Three things are readable at a glance, and no more than three:
 *   * the fill    — coloured when we know where they are, grey when their last
 *                   fix is older than the dispatch window, so a grey disc means
 *                   "this person is not reachable by dispatch either";
 *   * the ring    — brand when they are out on a course;
 *   * the dot     — present when the app is open on their phone right now.
 *
 * No photos: nobody uploads one, and an avatar that is always a placeholder is
 * a placeholder, not an avatar.
 */

const SIZES = {
  sm: { box: "h-9 w-9", text: "text-[12px]", dot: "h-2.5 w-2.5" },
  md: { box: "h-11 w-11", text: "text-[14px]", dot: "h-3 w-3" },
} as const;

export function DriverAvatar({
  member,
  online = false,
  size = "md",
  className = "",
}: {
  member: CrewMember;
  /** Their app is open — from Realtime presence, not from the database. */
  online?: boolean;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const s = SIZES[size];
  const fresh = member.positionFresh;

  return (
    <span className={`relative inline-flex flex-none ${className}`}>
      <span
        className={`flex ${s.box} items-center justify-center rounded-full font-semibold text-white ring-2 ${
          member.order ? "ring-brand" : "ring-white"
        }`}
        style={{ backgroundColor: fresh ? avatarTint(member.id) : "#A8A29E" }}
      >
        <span className={s.text}>{initials(member.name)}</span>
      </span>
      {online && (
        <span
          className={`absolute -bottom-0.5 -end-0.5 ${s.dot} rounded-full border-2 border-white bg-success`}
        />
      )}
    </span>
  );
}
