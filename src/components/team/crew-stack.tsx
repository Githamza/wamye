"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useTeamPresence } from "@/lib/hooks/use-team-presence";
import type { CrewMember } from "@/lib/crew";
import { DriverAvatar } from "./driver-avatar";

/**
 * The team, as a pile of discs in the corner of the courses page.
 *
 * Deliberately wordless: the count is the message — how many of us are out,
 * how many are moving — and the courses are why the app is open, so this takes
 * a corner rather than a band across the top. Who is on what is one tap away,
 * and the screen reader gets the sentence the discs stand in for.
 */

/** Beyond this the row stops being scannable and starts being a crowd. */
const SHOWN = 5;

export function CrewStack({
  crew,
  tenantId,
  profileId,
}: {
  crew: CrewMember[];
  tenantId: string;
  profileId: string;
}) {
  const t = useTranslations("Dashboard.crew");
  const online = useTeamPresence(tenantId, profileId);

  // Alone on the team: there is nobody to look at.
  if (crew.length < 2) return null;

  const shown = crew.slice(0, SHOWN);
  const extra = crew.length - shown.length;
  const delivering = crew.filter((m) => m.order).length;

  const summary = t("summary", {
    online: crew.filter((m) => online.has(m.id)).length,
    delivering,
  });

  return (
    <Link
      href="/dashboard/crew"
      aria-label={`${t("title")} — ${summary}`}
      title={summary}
      className="flex items-center self-end rounded-full p-1 transition-colors hover:bg-hair-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      {shown.map((m, i) => (
        <DriverAvatar
          key={m.id}
          member={m}
          online={online.has(m.id)}
          size="sm"
          className={i === 0 ? "" : "-ms-2.5"}
        />
      ))}
      {extra > 0 && (
        <span className="-ms-2.5 flex h-9 w-9 flex-none items-center justify-center rounded-full bg-hair-2 text-[12px] font-semibold text-stone-muted ring-2 ring-white">
          +{extra}
        </span>
      )}
    </Link>
  );
}
