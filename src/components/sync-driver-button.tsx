"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { syncDriverToFleetbase, type SyncCode, type SyncResult } from "@/lib/actions/team";

// The action's codes name Fleetbase; the reader only ever hears "Navigator",
// so the mapping from code to message key lives here, next to the wording.
const MESSAGE_KEY: Record<SyncCode, string> = {
  created: "created",
  linked: "linked",
  "already-synced": "alreadySynced",
  "member-not-found": "memberNotFound",
  forbidden: "forbidden",
  "phone-missing": "phoneMissing",
  "no-fleetbase-key": "noKey",
  "email-not-found": "emailNotFound",
  "fleetbase-error": "failed",
  failed: "failed",
};

/**
 * Register a team member as a driver in the tenant's Fleetbase company, which
 * is what lets Navigator dispatch to them. The sync is retryable on purpose:
 * approval must never hard-fail on a Fleetbase outage, so it stays a separate,
 * explicit step.
 */
export function SyncDriverButton({
  profileId,
  synced,
}: {
  profileId: string;
  synced: boolean;
}) {
  const t = useTranslations("Dashboard.sync");
  const [result, setResult] = useState<SyncResult>(null);
  const [pending, start] = useTransition();

  if (synced && !result) {
    return <span className="text-[13px] text-success">{t("synced")}</span>;
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => setResult(await syncDriverToFleetbase(profileId)))}
        className="h-9 rounded-[8px] border border-hair bg-white px-3 text-[13px] font-medium text-stone-ink hover:bg-hair-2 disabled:opacity-50"
      >
        {pending ? t("pending") : t("button")}
      </button>
      {result && (
        <span className={`text-[13px] ${result.ok ? "text-success" : "text-danger-ink"}`}>
          {result.detail
            ? t("failedDetail", {
                status: result.detail.status,
                message: result.detail.message,
              })
            : t(MESSAGE_KEY[result.code])}
        </span>
      )}
    </div>
  );
}
