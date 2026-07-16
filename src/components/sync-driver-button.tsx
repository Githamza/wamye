"use client";

import { useState, useTransition } from "react";
import { syncDriverToFleetbase, type SyncResult } from "@/lib/actions/team";

/**
 * Register a team member as a driver in the tenant's Fleetbase company. The
 * sync is retryable on purpose: approval must never hard-fail on a Fleetbase
 * outage, so it stays a separate, explicit step.
 */
export function SyncDriverButton({
  profileId,
  synced,
}: {
  profileId: string;
  synced: boolean;
}) {
  const [result, setResult] = useState<SyncResult>(null);
  const [pending, start] = useTransition();

  if (synced && !result) {
    return <span className="text-[13px] text-success">Fleetbase ✓</span>;
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => setResult(await syncDriverToFleetbase(profileId)))}
        className="h-9 rounded-[8px] border border-hair bg-white px-3 text-[13px] font-medium text-stone-ink hover:bg-hair-2 disabled:opacity-50"
      >
        {pending ? "Synchro…" : "Synchroniser Fleetbase"}
      </button>
      {result && (
        <span className={`text-[13px] ${result.ok ? "text-success" : "text-danger-ink"}`}>
          {result.message}
        </span>
      )}
    </div>
  );
}
